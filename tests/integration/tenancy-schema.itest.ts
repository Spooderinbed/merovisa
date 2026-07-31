/**
 * MV-150 — Stage 1 tenancy core schema, proven against a real local Postgres.
 *
 * The migration (`supabase/migrations/20260730120000_stage1_tenancy_core.sql`) ships six
 * tables LOCKED SHUT. Every guarantee it makes is a property of the database, and a mocked
 * supabase-js client structurally cannot observe any of them. This suite proves:
 *
 *  - **the tables stay closed by construction** — RLS is enabled AND *forced* on all six tables
 *    (a missing `force` leaves the table owner exempt and would silently reopen the door), and
 *    a client role that belongs to nothing reads and writes nothing. Asserted from `pg_class` /
 *    `pg_policy` / `information_schema` rather than trusted from the DDL by eye, then confirmed
 *    behaviourally with a real signed-in client. **Updated by MV-152** (20260730180000), which
 *    replaced the deny-all policies with the real case-aware matrix and granted `authenticated`
 *    a reviewed verb set: the assertions here narrowed to what survives that swap (no deny-all
 *    left behind, every table still policied, anon still holds nothing, a non-member still sees
 *    and changes nothing). The positive matrix itself is `case-rls.itest.ts`;
 *  - **append-only is a database property, not a convention** — an UPDATE on `audit_events`
 *    raises *even for `service_role`*, which bypasses RLS and holds full table grants. Revoked
 *    privileges alone could never prove this;
 *  - **the audit row is a tombstone** — deleting its organization leaves it standing with its
 *    `organization_id` intact. This is the payoff of the bare-uuid/no-FK decision: an
 *    `on delete set null` FK would fire a system UPDATE that the immutability trigger would
 *    reject, making the parent delete fail outright;
 *  - **invitation integrity** — `unique (token_hash)` (what makes single-acceptance
 *    compare-and-swap enforceable) and the team-XOR-student shape check;
 *  - **one primary counsellor per case** — the partial unique index;
 *  - **every foreign key is covered by an index** — computed from `pg_constraint`/`pg_index`
 *    the way the Supabase advisor does, so it survives index renaming. MV-152's RLS helper
 *    predicates read these columns; an unindexed one is a defect.
 *
 * Real policy logic is MV-152 and the full positive/negative authorization matrix is MV-153.
 * This suite's job is narrower: prove Stage 1 landed the tables closed and the constraints
 * real.
 *
 * Catalog assertions and the `private.write_audit_event` call go through `psql` inside the
 * Supabase DB container: `private` is not an exposed API schema (by design — the writer is
 * inert until MV-152's grant review) and PostgREST cannot read `pg_catalog`. The suite already
 * requires a local Docker stack, so `docker` is available by construction. No new packages.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. Excluded from the default `npm test`
 * (see vitest.config.ts), run only by `npm run test:integration`
 * (vitest.integration.config.ts).
 *
 * Run locally:
 *   npx supabase start
 *   # from `npx supabase status -o env`:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   $env:SUPABASE_TEST_ANON_KEY = "<ANON_KEY>"   # needed to sign in as a real client role
 *   npm run test:integration
 *
 * Skips cleanly (never fails) when those env vars are absent. LOCAL STACK ONLY — it writes
 * rows and deletes the ones it created.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

/** The six tables MV-150 adds. Every one must be closed to every client role. */
const TENANCY_TABLES = [
  "organizations",
  "organization_memberships",
  "cases",
  "case_assignments",
  "invitations",
  "audit_events",
] as const;
type TenancyTable = (typeof TENANCY_TABLES)[number];

/**
 * HARD localhost guard — not a comment, a gate.
 *
 * This suite writes to the tenancy tables, calls the audit writer, and deletes organizations
 * (which cascades to memberships, cases, assignments, and invitations). Pointed at a real
 * project by a stale SUPABASE_TEST_URL — copied from Vercel, or left in a shell from a data
 * check — it would destroy consultancy records. Refuse to run anywhere but a local stack.
 */
const isLocalStack = (u: string | undefined): boolean => {
  if (!u) return false;
  try {
    const { hostname } = new URL(u);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
};

if (url && !isLocalStack(url)) {
  throw new Error(
    `tenancy-schema.itest.ts refuses to run against a non-local database (SUPABASE_TEST_URL=${url}). ` +
      "This suite writes tenancy rows and cascades organization deletes. Point it at a local " +
      "`npx supabase start` stack, or unset the variable.",
  );
}

describe.skipIf(!url || !serviceKey || !anonKey)("MV-150 tenancy core schema against a real local Postgres", () => {
  let admin: SupabaseClient<Database>;
  let dbContainer: string;
  /** A signed-in client carrying a real `authenticated` JWT — the cold client role. */
  let authed: SupabaseClient<Database>;
  /** A client carrying only the anon key — the unauthenticated role. */
  let anon: SupabaseClient<Database>;

  const stamp = Date.now();
  const seededOrgIds: string[] = [];
  const seededAuditIds: string[] = [];
  const seededUserIds: string[] = [];
  let orgId: string;
  let caseId: string;
  let memberUserId: string;

  /** Run SQL as `postgres` inside the stack's DB container; returns non-empty trimmed lines. */
  const sql = (statement: string): string[] => {
    const out = execFileSync(
      "docker",
      ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAX", "-c", statement],
      { encoding: "utf8" },
    );
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  };

  const sqlOne = (statement: string): string => {
    const rows = sql(statement);
    const [only] = rows;
    if (rows.length !== 1 || only === undefined) {
      throw new Error(`expected exactly one row from: ${statement} (got ${rows.length})`);
    }
    return only;
  };

  const resolveDbContainer = (): string => {
    if (process.env.SUPABASE_TEST_DB_CONTAINER) return process.env.SUPABASE_TEST_DB_CONTAINER;
    const names = execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], {
      encoding: "utf8",
    })
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    const [first] = names;
    if (first === undefined) {
      throw new Error(
        "no running supabase_db_* container found. Start the stack with `npx supabase start`, " +
          "or set SUPABASE_TEST_DB_CONTAINER.",
      );
    }
    return first;
  };

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    dbContainer = resolveDbContainer();

    // A real signed-in user, so the deny-all checks run as the `authenticated` DB role rather
    // than as anon-with-a-header.
    const email = `mv150-tenancy-${stamp}@example.test`;
    const password = `pw-${stamp}-Aa!`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) throw new Error(`failed to mint test user: ${createError?.message}`);
    memberUserId = created.user.id;
    seededUserIds.push(memberUserId);

    anon = createClient<Database>(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
    const signIn = createClient<Database>(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session, error: signInError } = await signIn.auth.signInWithPassword({ email, password });
    if (signInError || !session.session) throw new Error(`failed to sign in test user: ${signInError?.message}`);
    authed = createClient<Database>(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    });

    // Fixtures, written with the service-role client (bypasses RLS, holds grants). Real ids
    // matter: the deny-all INSERT probes below reference them, so an accepted write would be
    // a genuine breach rather than a constraint error masquerading as a rejection.
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: "MV-150 Fixture Consultancy", slug: `mv150-fixture-${stamp}` })
      .select("id")
      .single();
    if (orgError || !org) throw new Error(`failed to seed organization: ${orgError?.message}`);
    orgId = org.id;
    seededOrgIds.push(orgId);

    const { data: kase, error: caseError } = await admin
      .from("cases")
      .insert({ organization_id: orgId, display_name: "Synthetic Student (no real PII — D-B)" })
      .select("id")
      .single();
    if (caseError || !kase) throw new Error(`failed to seed case: ${caseError?.message}`);
    caseId = kase.id;
  });

  afterAll(async () => {
    if (!admin) return;
    // Orgs cascade to memberships, cases, assignments, and invitations.
    if (seededOrgIds.length) await admin.from("organizations").delete().in("id", seededOrgIds);
    // audit_events carries no FK on purpose, so it never cascades — remove it explicitly.
    if (seededAuditIds.length) await admin.from("audit_events").delete().in("id", seededAuditIds);
    for (const id of seededUserIds) await admin.auth.admin.deleteUser(id);
  });

  describe("the six tables land locked shut", () => {
    it("exists with RLS enabled AND forced on every table", () => {
      const rows = sql(`
        select c.relname || '|' || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")})
        order by c.relname;
      `);
      // `force` is the load-bearing half: without it the migration role that owns these tables
      // is exempt from its own deny-all.
      expect(rows).toEqual(
        [...TENANCY_TABLES].sort().map((table) => `${table}|true|true`),
      );
    });

    // MV-152 (20260730180000) dropped the deny-all policies and landed the reviewed grant set,
    // so the two assertions that used to live here — "exactly one deny-all policy per table"
    // and "no grant whatsoever to anon or authenticated" — are now false BY DESIGN. They are
    // not deleted: what they were really protecting is that the swap is total and that anon
    // gained nothing on the way through. That is what the two below assert. The positive
    // matrix itself lives in tests/integration/case-rls.itest.ts.
    it("has no deny-all policy left, and every table still carries real policies", () => {
      const denyAll = sql(`
        select p.polname from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and p.polname like '%_deny_all'
          and c.relname in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")});
      `);
      expect(denyAll).toEqual([]);

      const withPolicies = sql(`
        select distinct c.relname from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")})
        order by c.relname;
      `);
      // A table that lost its deny-all without gaining a policy would be closed by accident
      // rather than on purpose — and one grant away from being wide open.
      expect(withPolicies).toEqual([...TENANCY_TABLES].sort());
    });

    it("still grants anon no privilege whatsoever on any of the six", () => {
      const rows = sql(`
        select table_name || '|' || grantee || '|' || privilege_type
        from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee = 'anon'
          and table_name in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")});
      `);
      // authenticated now holds a reviewed set (asserted exactly in case-rls.itest.ts); anon
      // was never meant to gain anything from that review and must not have.
      expect(rows).toEqual([]);
    });
  });

  describe("a cold client role can neither read nor write any of the six", () => {
    /** Valid-shaped rows: a rejection must be about privilege, never a missing column. */
    const insertPayload = (table: TenancyTable): Record<string, unknown> => {
      switch (table) {
        case "organizations":
          return { name: "Breach Co", slug: `breach-${stamp}` };
        case "organization_memberships":
          return { organization_id: orgId, user_id: memberUserId, role: "counsellor" };
        case "cases":
          return { organization_id: orgId, display_name: "Breach Case" };
        case "case_assignments":
          return { case_id: caseId, user_id: memberUserId, assignment_role: "primary_counsellor" };
        case "invitations":
          return {
            organization_id: orgId,
            email: "breach@example.test",
            role: "counsellor",
            token_hash: `breach-${stamp}`,
            expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          };
        case "audit_events":
          return { action: "breach.attempt" };
      }
    };

    for (const role of ["authenticated", "anon"] as const) {
      it(`reads zero rows from every table as ${role}`, async () => {
        for (const table of TENANCY_TABLES) {
          const client = role === "anon" ? anon : authed;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (client.from(table) as any).select("*");
          expect(data ?? [], `${role} must not read ${table}`).toEqual([]);
        }
      });

      it(`cannot INSERT into any table as ${role}`, async () => {
        for (const table of TENANCY_TABLES) {
          const client = role === "anon" ? anon : authed;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (client.from(table) as any).insert(insertPayload(table));
          expect(error, `${role} INSERT into ${table} must be rejected`).not.toBeNull();
          // 42501 = insufficient_privilege / RLS violation. Asserting the CODE matters: a
          // constraint error (23xxx) would also look like "rejected" while proving nothing
          // about authorization.
          expect(error!.code, `${role} INSERT into ${table} rejected for the wrong reason`).toBe("42501");
        }
      });

      it(`cannot UPDATE or DELETE the seeded organization as ${role}`, async () => {
        const client = role === "anon" ? anon : authed;
        const { error: updateError } = await client
          .from("organizations")
          .update({ name: "Renamed by an outsider" })
          .eq("id", orgId);
        const { error: deleteError } = await client.from("organizations").delete().eq("id", orgId);

        if (role === "anon") {
          // anon holds no grant at all, so the refusal is a hard privilege error.
          expect(updateError?.code, "anon UPDATE must be rejected").toBe("42501");
          expect(deleteError?.code, "anon DELETE must be rejected").toBe("42501");
        } else {
          // MV-152 changed the SHAPE of this denial, not its outcome. `authenticated` now
          // holds the grant, and this user is a member of nothing, so the policy's USING
          // clause simply matches no row: PostgREST reports success over zero rows. That is
          // why the row check below is the real assertion and the error code never was —
          // a silent no-op and a successful cross-tenant rename look identical from the
          // error alone.
          expect(updateError, "a non-member UPDATE is a silent USING miss, not an error").toBeNull();
          expect(deleteError, "a non-member DELETE is a silent USING miss, not an error").toBeNull();
        }

        // Prove the row is untouched, not merely that an error came back.
        const { data } = await admin.from("organizations").select("name").eq("id", orgId).single();
        expect(data?.name).toBe("MV-150 Fixture Consultancy");
      });
    }
  });

  describe("audit_events is append-only as a database property", () => {
    it("accepts a write through the private.write_audit_event choke point", async () => {
      const auditId = sqlOne(`
        select private.write_audit_event(
          'case.created', '${orgId}'::uuid, '${caseId}'::uuid, '${memberUserId}'::uuid,
          'case', '${caseId}', '{"safe":true}'::jsonb
        );
      `);
      expect(auditId).toMatch(/^[0-9a-f-]{36}$/);
      seededAuditIds.push(auditId);

      const { data } = await admin
        .from("audit_events")
        .select("action, organization_id, case_id, actor_user_id, metadata")
        .eq("id", auditId)
        .single();
      expect(data?.action).toBe("case.created");
      expect(data?.organization_id).toBe(orgId);
      expect(data?.actor_user_id).toBe(memberUserId);
    });

    it("is SECURITY DEFINER with a pinned search_path and no EXECUTE grant to any client role", () => {
      const row = sqlOne(`
        select p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), 'NONE')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'write_audit_event';
      `);
      expect(row).toBe('true|search_path=""');
      // Inert in Stage 1 — MV-152's grant review decides who may call it.
      const grants = sql(`
        select coalesce(array_to_string(p.proacl, ' '), '')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'write_audit_event';
      `);
      expect(grants.join(" ")).not.toMatch(/(^|[ ={])(anon|authenticated|service_role)=/);
    });

    it("rejects an UPDATE even for service_role, which bypasses RLS and holds full grants", async () => {
      const auditId = sqlOne(
        `select private.write_audit_event('immutability.probe', '${orgId}'::uuid, null, null, null, null, '{}'::jsonb);`,
      );
      seededAuditIds.push(auditId);

      const { error } = await admin.from("audit_events").update({ action: "tampered" }).eq("id", auditId);
      // The whole point: revoking UPDATE could never stop service_role. Only the trigger can.
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/append-only/i);

      const { data } = await admin.from("audit_events").select("action").eq("id", auditId).single();
      expect(data?.action).toBe("immutability.probe");
    });

    it("survives the deletion of its organization with its organization_id intact", async () => {
      const { data: doomed, error: seedError } = await admin
        .from("organizations")
        .insert({ name: "Tombstone Co", slug: `mv150-tombstone-${stamp}` })
        .select("id")
        .single();
      if (seedError || !doomed) throw new Error(`failed to seed tombstone org: ${seedError?.message}`);

      const auditId = sqlOne(
        `select private.write_audit_event('organization.deleted', '${doomed.id}'::uuid, null, null, 'organization', '${doomed.id}', '{}'::jsonb);`,
      );
      seededAuditIds.push(auditId);

      // A real FK would make this delete FAIL: `on delete set null` fires a system UPDATE that
      // the immutability trigger rejects. Bare uuid is what lets an org be deleted at all
      // while its history stands.
      const { error: deleteError } = await admin.from("organizations").delete().eq("id", doomed.id);
      expect(deleteError).toBeNull();

      const { data: org } = await admin.from("organizations").select("id").eq("id", doomed.id).maybeSingle();
      expect(org).toBeNull();

      const { data: audit } = await admin
        .from("audit_events")
        .select("organization_id, action")
        .eq("id", auditId)
        .single();
      expect(audit?.organization_id).toBe(doomed.id);
      expect(audit?.action).toBe("organization.deleted");
    });

    it("has no updated_at column and no foreign keys (the deliberate tombstone fork)", () => {
      const columns = sql(`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'audit_events' and column_name = 'updated_at';
      `);
      expect(columns).toEqual([]);

      const fks = sql(`
        select conname from pg_constraint
        where conrelid = 'public.audit_events'::regclass and contype = 'f';
      `);
      expect(fks).toEqual([]);
    });
  });

  describe("invitation integrity", () => {
    const expiresAt = () => new Date(Date.now() + 86_400_000).toISOString();

    it("rejects a duplicate token_hash (what makes single-acceptance CAS enforceable)", async () => {
      const tokenHash = `mv150-dup-${stamp}`;
      const first = await admin
        .from("invitations")
        .insert({
          organization_id: orgId,
          email: "first@example.test",
          role: "counsellor",
          token_hash: tokenHash,
          expires_at: expiresAt(),
        });
      expect(first.error).toBeNull();

      const second = await admin.from("invitations").insert({
        organization_id: orgId,
        email: "second@example.test",
        role: "admin",
        token_hash: tokenHash,
        expires_at: expiresAt(),
      });
      expect(second.error?.code).toBe("23505"); // unique_violation
    });

    it("rejects a student invite with no case, and a team invite carrying a case", async () => {
      const studentWithoutCase = await admin.from("invitations").insert({
        organization_id: orgId,
        email: "student@example.test",
        role: "student",
        token_hash: `mv150-student-nocase-${stamp}`,
        expires_at: expiresAt(),
      });
      expect(studentWithoutCase.error?.code).toBe("23514"); // check_violation

      const teamWithCase = await admin.from("invitations").insert({
        organization_id: orgId,
        case_id: caseId,
        email: "counsellor@example.test",
        role: "counsellor",
        token_hash: `mv150-team-withcase-${stamp}`,
        expires_at: expiresAt(),
      });
      expect(teamWithCase.error?.code).toBe("23514");
    });

    it("accepts both valid shapes", async () => {
      const team = await admin.from("invitations").insert({
        organization_id: orgId,
        email: "team@example.test",
        role: "counsellor",
        token_hash: `mv150-team-ok-${stamp}`,
        expires_at: expiresAt(),
      });
      expect(team.error).toBeNull();

      const student = await admin.from("invitations").insert({
        case_id: caseId,
        email: "student-ok@example.test",
        role: "student",
        token_hash: `mv150-student-ok-${stamp}`,
        expires_at: expiresAt(),
      });
      expect(student.error).toBeNull();
    });
  });

  describe("case shape and assignment rules", () => {
    it("allows at most one primary counsellor per case", async () => {
      const { data: second } = await admin.auth.admin.createUser({
        email: `mv150-second-counsellor-${stamp}@example.test`,
        email_confirm: true,
      });
      const secondUserId = second.user!.id;
      seededUserIds.push(secondUserId);

      const first = await admin
        .from("case_assignments")
        .insert({ case_id: caseId, user_id: memberUserId, assignment_role: "primary_counsellor" });
      expect(first.error).toBeNull();

      const clash = await admin
        .from("case_assignments")
        .insert({ case_id: caseId, user_id: secondUserId, assignment_role: "primary_counsellor" });
      expect(clash.error?.code).toBe("23505");
    });

    it("keeps the case but nulls student_user_id when the student's Auth account is deleted", async () => {
      const { data: student } = await admin.auth.admin.createUser({
        email: `mv150-student-${stamp}@example.test`,
        email_confirm: true,
      });
      const studentId = student.user!.id;

      const { data: kase, error: seedError } = await admin
        .from("cases")
        .insert({ organization_id: orgId, display_name: "Claimed Case", student_user_id: studentId })
        .select("id")
        .single();
      if (seedError || !kase) throw new Error(`failed to seed claimed case: ${seedError?.message}`);

      await admin.auth.admin.deleteUser(studentId);

      // SET NULL, never CASCADE: a student deleting their account must not destroy the
      // consultancy's record of the case.
      const { data: after } = await admin
        .from("cases")
        .select("id, student_user_id")
        .eq("id", kase.id)
        .single();
      expect(after?.id).toBe(kase.id);
      expect(after?.student_user_id).toBeNull();
    });

    it("identifies an unclaimed case by a null student_user_id and dates it (retention door left open)", async () => {
      // MV-149 carried design input: the eventual unclaimed-case purge rule is a founder
      // decision. Stage 1 only guarantees such a rule is expressible.
      const { data } = await admin
        .from("cases")
        .select("id, created_at, student_user_id")
        .eq("id", caseId)
        .single();
      expect(data?.student_user_id).toBeNull();
      expect(Number.isNaN(Date.parse(data!.created_at))).toBe(false);
    });

    it("rejects an operational_status outside the five pilot values", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin.from("cases") as any).insert({
        organization_id: orgId,
        display_name: "Bad Status",
        operational_status: "on_holiday",
      });
      expect(error?.code).toBe("23514");
    });

    it("keeps updated_at moving via the shared trigger", async () => {
      const { data: before } = await admin
        .from("organizations")
        .select("created_at, updated_at")
        .eq("id", orgId)
        .single();
      const { error } = await admin
        .from("organizations")
        .update({ name: "MV-150 Fixture Consultancy" })
        .eq("id", orgId);
      expect(error).toBeNull();

      const { data: after } = await admin
        .from("organizations")
        .select("updated_at")
        .eq("id", orgId)
        .single();
      expect(Date.parse(after!.updated_at)).toBeGreaterThan(Date.parse(before!.created_at));
    });
  });

  describe("indexing is advisor-clean and predicate-ready", () => {
    it("covers every foreign key with an index whose leading column is the FK column", () => {
      // Computed the way the Supabase advisor's unindexed_foreign_keys check works, so it
      // survives index renaming and proves coverage rather than the presence of a named index.
      const uncovered = sql(`
        select c.conrelid::regclass::text || '.' || a.attname
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f'
          and c.conrelid in (${TENANCY_TABLES.map((t) => `'public.${t}'::regclass`).join(",")})
          and not exists (
            select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
          );
      `);
      expect(uncovered).toEqual([]);
    });

    it("indexes every column MV-152's RLS predicates will read", () => {
      // Leading-column coverage, so a composite index counts (e.g. the unique constraint on
      // (organization_id, user_id) covers organization_id).
      const required: Array<[TenancyTable, string]> = [
        ["organization_memberships", "user_id"],
        ["organization_memberships", "organization_id"],
        ["case_assignments", "case_id"],
        ["case_assignments", "user_id"],
        ["cases", "organization_id"],
        ["cases", "student_user_id"],
        ["cases", "created_by"],
        ["audit_events", "organization_id"],
        ["audit_events", "case_id"],
        ["audit_events", "actor_user_id"],
        ["audit_events", "created_at"],
        ["invitations", "organization_id"],
        ["invitations", "case_id"],
        ["invitations", "invited_by"],
        ["invitations", "email"],
        ["invitations", "token_hash"],
      ];
      const missing = required.filter(([table, column]) => {
        const hit = sqlOne(`
          select count(*) from pg_index i
          join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
          where i.indrelid = 'public.${table}'::regclass and a.attname = '${column}';
        `);
        return hit === "0";
      });
      expect(missing).toEqual([]);
    });

    it("keeps membership status available to the org-scoped predicate", () => {
      // "the active members of this org" must be answerable from an index, not a heap filter.
      const hit = sqlOne(`
        select count(*) from pg_index i
        where i.indrelid = 'public.organization_memberships'::regclass
          and (
            select array_agg(a.attname::text order by k.ord)
            from unnest(i.indkey::smallint[]) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
          ) @> array['organization_id','status']::text[];
      `);
      expect(Number(hit)).toBeGreaterThan(0);
    });
  });
});
