/**
 * MV-152 — Case-aware RLS policies, proven against a real local Postgres.
 *
 * MV-150 shipped the six tenancy tables LOCKED SHUT (named deny-all, no grants).
 * `supabase/migrations/20260730180000_case_aware_rls_policies.sql` replaces that with the
 * real matrix. Every guarantee below is a property of the database evaluated **as the
 * authenticated user** — a mocked supabase-js client, and equally a service-role client,
 * structurally cannot observe any of it (service_role has BYPASSRLS, so a green
 * service-role test proves exactly nothing about tenant isolation).
 *
 * This is MV-152's own policy smoke: it proves the policies function. The exhaustive
 * negative catalogue and the full positive matrix that ARE the Stage 1 exit gate belong to
 * MV-153, which builds on this being green.
 *
 * The four proofs the card singles out:
 *
 *  - **anti-recursion** — a SELECT on `organization_memberships` as an active member returns
 *    co-members instead of raising `infinite recursion detected in policy for relation
 *    "organization_memberships"`. That error is the exact failure mode of a membership policy
 *    that reads memberships inline; the `private` SECURITY DEFINER helpers (owned by
 *    `postgres`, which holds BYPASSRLS) are what break the loop;
 *  - **inactive membership = immediate loss** — flip `status` to 'inactive' and the SAME
 *    signed-in client sees zero rows on its next query, with no session refresh. Revocation
 *    is a row edit, not a token property;
 *  - **no silent write hole** — every UPDATE policy carries USING *and* WITH CHECK, and the
 *    tenant-escaping columns (`organization_id`, `student_user_id`) are not in the client's
 *    column-level UPDATE grant at all, so "repoint this case at another org / another
 *    student" is rejected rather than silently applied;
 *  - **the predicates hit indexes** — the EXPLAIN case at the foot proves the helper is an
 *    InitPlan (once per statement, not once per row) and that `cases` is reached by index,
 *    not a Seq Scan, at a row count where the planner has a real choice.
 *
 * Catalog assertions run through `psql` inside the Supabase DB container: `private` is not a
 * PostgREST-exposed schema (by design — that is what keeps the definer helpers off the RPC
 * surface) and PostgREST cannot read `pg_catalog`. The suite already requires a local Docker
 * stack, so `docker` is available by construction. No new packages.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. Excluded from the default `npm test`
 * (see vitest.config.ts), run only by `npm run test:integration`.
 *
 * Run locally:
 *   npx supabase start
 *   # from `npx supabase status -o env`:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   $env:SUPABASE_TEST_ANON_KEY = "<ANON_KEY>"
 *   npm run test:integration
 *
 * Skips cleanly (never fails) when those env vars are absent. LOCAL STACK ONLY.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

const TENANCY_TABLES = [
  "organizations",
  "organization_memberships",
  "cases",
  "case_assignments",
  "invitations",
  "audit_events",
] as const;

/** Every helper MV-152 adds, with its argument list — the signature MV-153 writes against. */
const HELPERS: ReadonlyArray<readonly [name: string, args: string]> = [
  ["org_role", "uuid"],
  ["is_org_admin", "uuid"],
  ["can_manage_case", "uuid"],
  ["can_access_case", "uuid"],
  ["is_case_org_member", "uuid, uuid"],
  ["actor_org_ids", ""],
  ["actor_admin_org_ids", ""],
  ["actor_owner_org_ids", ""],
  ["actor_assigned_case_ids", ""],
] as const;

/**
 * HARD localhost guard — not a comment, a gate.
 *
 * This suite mints users, writes tenancy rows, flips a membership to inactive, and deletes
 * organizations (which cascades to memberships, cases, assignments, and invitations). Pointed
 * at a real project by a stale SUPABASE_TEST_URL it would destroy consultancy records and
 * revoke a real member. Refuse to run anywhere but a local stack.
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
    `case-rls.itest.ts refuses to run against a non-local database (SUPABASE_TEST_URL=${url}). ` +
      "This suite writes tenancy rows, revokes a membership, and cascades organization deletes. " +
      "Point it at a local `npx supabase start` stack, or unset the variable.",
  );
}

/** A signed-in actor: a real `authenticated` JWT, never the service-role client. */
type Actor = { id: string; email: string; client: SupabaseClient<Database> };

describe.skipIf(!url || !serviceKey || !anonKey)("MV-152 case-aware RLS against a real local Postgres", () => {
  let admin: SupabaseClient<Database>;
  let dbContainer: string;
  let anon: SupabaseClient<Database>;

  const stamp = Date.now();
  const password = `pw-${stamp}-Aa!`;
  const seededUserIds: string[] = [];
  const seededOrgIds: string[] = [];
  const seededCaseIds: string[] = [];
  const seededAuditIds: string[] = [];

  // Org A — the tenant under test, staffed with one of every role.
  let ownerA: Actor;
  let adminA: Actor;
  let counsellorA: Actor; // assigned to caseA1
  let counsellorLoner: Actor; // active member of org A, assigned to nothing
  let revokedA: Actor; // starts active + assigned to caseA2; flipped inactive mid-suite
  let studentA: Actor; // linked to caseA1 and to a personal case
  // Org B — the neighbouring tenant. Everything it does to org A must fail.
  let adminB: Actor;
  // No membership anywhere.
  let outsider: Actor;

  let orgA: string;
  let orgB: string;
  let caseA1: string;
  let caseA2: string;
  let caseB1: string;
  let casePersonal: string;

  /** Run SQL as `postgres` inside the stack's DB container; returns non-empty trimmed lines. */
  const sql = (statement: string): string[] =>
    execFileSync(
      "docker",
      ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAX", "-c", statement],
      { encoding: "utf8" },
    )
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

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

  const mintActor = async (label: string): Promise<Actor> => {
    const email = `mv152-${label}-${stamp}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`failed to mint ${label}: ${error?.message}`);
    seededUserIds.push(data.user.id);

    const signIn = createClient<Database>(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session, error: signInError } = await signIn.auth.signInWithPassword({ email, password });
    if (signInError || !session.session) throw new Error(`failed to sign in ${label}: ${signInError?.message}`);

    return {
      id: data.user.id,
      email,
      client: createClient<Database>(url!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
      }),
    };
  };

  const seedOrg = async (slug: string, name: string): Promise<string> => {
    const { data, error } = await admin.from("organizations").insert({ name, slug }).select("id").single();
    if (error || !data) throw new Error(`failed to seed org ${slug}: ${error?.message}`);
    seededOrgIds.push(data.id);
    return data.id;
  };

  const seedCase = async (row: {
    organization_id?: string | null;
    student_user_id?: string | null;
    display_name: string;
  }): Promise<string> => {
    const { data, error } = await admin.from("cases").insert(row).select("id").single();
    if (error || !data) throw new Error(`failed to seed case ${row.display_name}: ${error?.message}`);
    seededCaseIds.push(data.id);
    return data.id;
  };

  const seedMembership = async (organizationId: string, userId: string, role: string): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from("organization_memberships") as any).insert({
      organization_id: organizationId,
      user_id: userId,
      role,
    });
    if (error) throw new Error(`failed to seed membership (${role}): ${error.message}`);
  };

  /** Case ids visible to an actor, sorted — the shape most assertions compare against. */
  const visibleCaseIds = async (actor: Actor): Promise<string[]> => {
    const { data, error } = await actor.client.from("cases").select("id");
    if (error) throw new Error(`${actor.email} could not list cases: ${error.message}`);
    return (data ?? []).map((row) => row.id).sort();
  };

  const caseField = async (caseId: string, column: "display_name" | "organization_id" | "student_user_id") => {
    const { data, error } = await admin.from("cases").select(column).eq("id", caseId).single();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>)[column];
  };

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    dbContainer = resolveDbContainer();
    anon = createClient<Database>(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });

    [ownerA, adminA, counsellorA, counsellorLoner, revokedA, studentA, adminB, outsider] = await Promise.all([
      mintActor("owner-a"),
      mintActor("admin-a"),
      mintActor("counsellor-a"),
      mintActor("counsellor-loner"),
      mintActor("revoked-a"),
      mintActor("student-a"),
      mintActor("admin-b"),
      mintActor("outsider"),
    ]);

    orgA = await seedOrg(`mv152-org-a-${stamp}`, "MV-152 Consultancy A");
    orgB = await seedOrg(`mv152-org-b-${stamp}`, "MV-152 Consultancy B");

    await seedMembership(orgA, ownerA.id, "owner");
    await seedMembership(orgA, adminA.id, "admin");
    await seedMembership(orgA, counsellorA.id, "counsellor");
    await seedMembership(orgA, counsellorLoner.id, "counsellor");
    await seedMembership(orgA, revokedA.id, "counsellor");
    await seedMembership(orgB, adminB.id, "owner");

    caseA1 = await seedCase({ organization_id: orgA, student_user_id: studentA.id, display_name: "Case A1" });
    caseA2 = await seedCase({ organization_id: orgA, display_name: "Case A2 (unclaimed)" });
    caseB1 = await seedCase({ organization_id: orgB, display_name: "Case B1" });
    // organization_id null = the personal case an individual student drives themselves.
    casePersonal = await seedCase({ student_user_id: studentA.id, display_name: "Personal case" });

    const { error: assignError } = await admin.from("case_assignments").insert([
      { case_id: caseA1, user_id: counsellorA.id, assignment_role: "primary_counsellor" },
      { case_id: caseA2, user_id: revokedA.id, assignment_role: "primary_counsellor" },
    ]);
    if (assignError) throw new Error(`failed to seed assignments: ${assignError.message}`);

    // Audit rows for both tenants, written through MV-150's choke point.
    for (const [org, action] of [
      [orgA, "case.created"],
      [orgB, "case.created"],
    ] as const) {
      seededAuditIds.push(sqlOne(`select private.write_audit_event('${action}', '${org}'::uuid);`));
    }
  });

  afterAll(async () => {
    if (!admin) return;
    if (seededOrgIds.length) await admin.from("organizations").delete().in("id", seededOrgIds);
    // The personal case has no organization to cascade from.
    if (seededCaseIds.length) await admin.from("cases").delete().in("id", seededCaseIds);
    if (seededAuditIds.length) await admin.from("audit_events").delete().in("id", seededAuditIds);
    for (const id of seededUserIds) await admin.auth.admin.deleteUser(id);
  });

  // ===================================================================
  describe("the swap landed: deny-all gone, RLS still forced, helpers hardened", () => {
    it("keeps RLS enabled AND forced on all six tables", () => {
      const rows = sql(`
        select c.relname || '|' || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")})
        order by c.relname;
      `);
      // A table that lost `force` would exempt its owner — the migration role — from its own
      // policies. Replacing policies must not disturb this.
      expect(rows).toEqual([...TENANCY_TABLES].sort().map((table) => `${table}|true|true`));
    });

    it("leaves no MV-150 deny-all policy behind on any table", () => {
      const survivors = sql(`
        select p.polname from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and p.polname like '%_deny_all'
          and c.relname in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")});
      `);
      expect(survivors).toEqual([]);
    });

    it("gives every table at least one real policy, scoped to authenticated only", () => {
      const rows = sql(`
        select c.relname || '|' || p.polname || '|' ||
               coalesce(array_to_string(array(
                 select r.rolname from pg_roles r where r.oid = any (p.polroles) order by r.rolname
               ), ','), 'PUBLIC')
        from pg_policy p join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")})
        order by c.relname, p.polname;
      `);
      for (const table of TENANCY_TABLES) {
        expect(rows.some((r) => r.startsWith(`${table}|`)), `${table} has no policy`).toBe(true);
      }
      // `anon` must never appear: anon holds no grants either, but a policy naming it would be
      // a standing invitation for a later grant to open the table by accident.
      for (const row of rows) expect(row.endsWith("|authenticated"), `not authenticated-only: ${row}`).toBe(true);
    });

    it("carries both USING and WITH CHECK on every UPDATE policy", () => {
      // USING without WITH CHECK is the silent write hole: a permitted row can be mutated INTO
      // a tenant-escaping state.
      const naked = sql(`
        select c.relname || '.' || p.polname
        from pg_policy p join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and p.polcmd = 'w'
          and c.relname in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")})
          and (p.polqual is null or p.polwithcheck is null);
      `);
      expect(naked).toEqual([]);
    });

    it("ships every helper SECURITY DEFINER + STABLE with a pinned empty search_path", () => {
      const rows = sql(`
        select p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')|'
               || p.prosecdef::text || '|' || p.provolatile::text || '|'
               || coalesce(array_to_string(p.proconfig, ','), 'NONE')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname in (${HELPERS.map(([name]) => `'${name}'`).join(",")})
        order by p.proname;
      `);
      // s = STABLE. A VOLATILE helper would re-evaluate per row; a mutable search_path is the
      // function_search_path_mutable advisor finding and a hijacking vector for a definer.
      expect(rows).toEqual(
        [...HELPERS]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, args]) => `${name}(${args})|true|s|search_path=""`),
      );
    });

    it("no policy predicate reads a tenancy table inline — every lookup goes through a helper", () => {
      // THE RECURSION LANDMINE, asserted structurally rather than hoped for: a predicate that
      // names a tenancy table is an inline subquery, and on a self-referential table that is an
      // infinite recursion abort.
      const offenders = sql(`
        select c.relname || '.' || p.polname
        from pg_policy p join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")})
          and (
            coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ '\\m(organization_memberships|case_assignments|cases|organizations|invitations|audit_events)\\M'
            or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ '\\m(organization_memberships|case_assignments|cases|organizations|invitations|audit_events)\\M'
          );
      `);
      expect(offenders).toEqual([]);
    });
  });

  // ===================================================================
  describe("the reviewed grant set: authenticated only, anon nothing", () => {
    it("grants authenticated exactly the intended table-level verbs", () => {
      const rows = sql(`
        select table_name || '|' || privilege_type
        from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'authenticated'
          and table_name in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")})
        order by table_name, privilege_type;
      `);
      expect(rows).toEqual([
        // audit_events: SELECT only. No INSERT (the private.write_audit_event choke point owns
        // writes), and no UPDATE/DELETE — append-only is a database property MV-152 must not
        // erode while "doing all six tables".
        "audit_events|SELECT",
        "case_assignments|DELETE",
        "case_assignments|INSERT",
        "case_assignments|SELECT",
        "cases|DELETE",
        "cases|INSERT",
        "cases|SELECT",
        // No INSERT on invitations' parent verbs beyond create/list; acceptance is a
        // service-role compare-and-swap (Stage 5), and DELETE is absent because revocation is
        // the audited path.
        "invitations|INSERT",
        "invitations|SELECT",
        "organization_memberships|DELETE",
        "organization_memberships|INSERT",
        "organization_memberships|SELECT",
        // No INSERT on organizations: tenant creation is a service-role onboarding path.
        "organizations|DELETE",
        "organizations|SELECT",
      ]);
    });

    it("grants UPDATE only on the columns that cannot carry a row out of its tenant", () => {
      const rows = sql(`
        select table_name || '.' || column_name
        from information_schema.column_privileges
        where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'
          and table_name in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")})
        order by table_name, column_name;
      `);
      // The absences are the point: cases.organization_id and cases.student_user_id are not
      // here, so "move this case to another org" and "repoint it at another student" are not
      // expressible by a client at all — the WITH CHECK behind them is defence in depth.
      // invitations.accepted_at is not here, so client-side acceptance stays closed.
      expect(rows).toEqual([
        "cases.archived_at",
        "cases.display_name",
        "cases.email",
        "cases.operational_status",
        "invitations.revoked_at",
        "organization_memberships.role",
        "organization_memberships.status",
        "organizations.name",
        "organizations.slug",
      ]);
    });

    it("grants anon nothing at all — no table verb, no column, no helper", () => {
      const tableGrants = sql(`
        select table_name || '|' || privilege_type
        from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'anon'
          and table_name in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")});
      `);
      expect(tableGrants).toEqual([]);

      const columnGrants = sql(`
        select table_name || '.' || column_name
        from information_schema.column_privileges
        where table_schema = 'public' and grantee = 'anon'
          and table_name in (${TENANCY_TABLES.map((t) => `'${t}'`).join(",")});
      `);
      expect(columnGrants).toEqual([]);

      expect(sqlOne(`select has_schema_privilege('anon', 'private', 'usage')::text;`)).toBe("false");
    });

    it("lets authenticated execute the helpers but never anon", () => {
      expect(sqlOne(`select has_schema_privilege('authenticated', 'private', 'usage')::text;`)).toBe("true");
      for (const [name, args] of HELPERS) {
        const signature = `private.${name}(${args})`;
        expect(
          sqlOne(`select has_function_privilege('authenticated', '${signature}', 'execute')::text;`),
          `authenticated must execute ${signature}`,
        ).toBe("true");
        expect(
          sqlOne(`select has_function_privilege('anon', '${signature}', 'execute')::text;`),
          `anon must not execute ${signature}`,
        ).toBe("false");
      }
    });

    it("keeps the definer helpers off the API surface (private is not an exposed schema)", () => {
      // authenticated holding EXECUTE is safe ONLY because `private` is unreachable as a
      // PostgREST RPC. If a future migration exposes it, every helper becomes directly
      // callable and `can_access_case` turns into an oracle.
      const exposed = sql(`
        select nspname from pg_namespace where nspname = 'private'
          and nspname = any (string_to_array(coalesce(current_setting('pgrst.db_schemas', true), 'public'), ','));
      `);
      expect(exposed).toEqual([]);
    });
  });

  // ===================================================================
  describe("anti-recursion: membership reads do not eat themselves", () => {
    it("lets an active member list co-members without an infinite-recursion abort", async () => {
      const { data, error } = await counsellorA.client
        .from("organization_memberships")
        .select("user_id, role, organization_id");
      // The failure this guards: 42P17 `infinite recursion detected in policy for relation
      // "organization_memberships"`, raised the moment a membership policy reads memberships
      // inline instead of through a SECURITY DEFINER helper.
      expect(error, `recursion or denial: ${error?.code} ${error?.message}`).toBeNull();

      const ids = (data ?? []).map((row) => row.user_id).sort();
      expect(ids).toEqual([ownerA.id, adminA.id, counsellorA.id, counsellorLoner.id, revokedA.id].sort());
      // Never a co-member of the neighbouring tenant.
      expect(ids).not.toContain(adminB.id);
    });

    it("shows an outsider no memberships at all", async () => {
      const { data, error } = await outsider.client.from("organization_memberships").select("user_id");
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    });

    it("lets a member read their organization, and only theirs", async () => {
      const { data, error } = await counsellorA.client.from("organizations").select("id");
      expect(error).toBeNull();
      expect((data ?? []).map((r) => r.id)).toEqual([orgA]);
    });
  });

  // ===================================================================
  describe("the positive matrix, evaluated as the authenticated user", () => {
    it("shows an org owner and an org admin every case in their org and nothing outside it", async () => {
      for (const actor of [ownerA, adminA]) {
        expect(await visibleCaseIds(actor), `${actor.email}`).toEqual([caseA1, caseA2].sort());
      }
    });

    it("shows a counsellor only the cases they are assigned to", async () => {
      expect(await visibleCaseIds(counsellorA)).toEqual([caseA1]);
    });

    it("shows an unassigned counsellor nothing, despite an active membership", async () => {
      // Assigned-only is the whole point of the counsellor role; "member of the org" is not
      // itself a case grant.
      expect(await visibleCaseIds(counsellorLoner)).toEqual([]);
    });

    it("shows a student their linked case and their personal case, and no other", async () => {
      expect(await visibleCaseIds(studentA)).toEqual([caseA1, casePersonal].sort());
    });

    it("shows the neighbouring tenant only its own case", async () => {
      expect(await visibleCaseIds(adminB)).toEqual([caseB1]);
    });

    it("shows an outsider nothing — knowing a case id grants no access", async () => {
      expect(await visibleCaseIds(outsider)).toEqual([]);
      const { data } = await outsider.client.from("cases").select("id, display_name").eq("id", caseA1);
      expect(data ?? []).toEqual([]);
    });

    it("shows anon nothing on any of the six tables", async () => {
      for (const table of TENANCY_TABLES) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (anon.from(table) as any).select("*");
        // anon holds no grant at all, so this is a privilege refusal, not an empty result set.
        expect(error?.code, `anon read of ${table}`).toBe("42501");
        expect(data ?? []).toEqual([]);
      }
    });
  });

  // ===================================================================
  describe("writes: USING finds the row, WITH CHECK stops it escaping", () => {
    it("lets an org admin rename a case in their own org", async () => {
      const renamed = `Case A2 renamed ${stamp}`;
      const { error } = await adminA.client.from("cases").update({ display_name: renamed }).eq("id", caseA2);
      expect(error).toBeNull();
      expect(await caseField(caseA2, "display_name")).toBe(renamed);
    });

    it("lets an assigned counsellor update their case but not an unassigned one", async () => {
      const { error } = await counsellorA.client
        .from("cases")
        .update({ operational_status: "in_progress" })
        .eq("id", caseA1);
      expect(error).toBeNull();

      const before = await caseField(caseA2, "display_name");
      const { error: blocked } = await counsellorA.client
        .from("cases")
        .update({ display_name: "counsellor reached across" })
        .eq("id", caseA2);
      // A USING miss is silent — no error, no rows. The row itself is the assertion.
      expect(blocked).toBeNull();
      expect(await caseField(caseA2, "display_name")).toBe(before);
    });

    it("refuses to let an admin move a case into an organization they do not administer", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (adminA.client.from("cases") as any)
        .update({ organization_id: orgB })
        .eq("id", caseA1);
      expect(error, "moving a case across tenants must be rejected, not silently applied").not.toBeNull();
      expect(error!.code).toBe("42501");
      expect(await caseField(caseA1, "organization_id")).toBe(orgA);
    });

    it("refuses to let an admin repoint a case at a different student", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (adminA.client.from("cases") as any)
        .update({ student_user_id: outsider.id })
        .eq("id", caseA1);
      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");
      expect(await caseField(caseA1, "student_user_id")).toBe(studentA.id);
    });

    it("refuses to let the neighbouring tenant touch or delete a case it can not see", async () => {
      const before = await caseField(caseA1, "display_name");
      const { error: updateError } = await adminB.client
        .from("cases")
        .update({ display_name: "owned by B now" })
        .eq("id", caseA1);
      expect(updateError).toBeNull(); // silent USING miss
      expect(await caseField(caseA1, "display_name")).toBe(before);

      const { error: deleteError } = await adminB.client.from("cases").delete().eq("id", caseA1);
      expect(deleteError).toBeNull();
      expect(await caseField(caseA1, "display_name")).toBe(before);
    });

    it("lets an org admin create and delete a case inside their own org only", async () => {
      const { data, error } = await adminA.client
        .from("cases")
        .insert({ organization_id: orgA, display_name: "Created by admin A" })
        .select("id")
        .single();
      expect(error).toBeNull();
      seededCaseIds.push(data!.id);

      const { error: crossOrg } = await adminA.client
        .from("cases")
        .insert({ organization_id: orgB, display_name: "Planted in B" });
      expect(crossOrg?.code, "creating a case in another tenant must be rejected").toBe("42501");

      const { error: deleteError } = await adminA.client.from("cases").delete().eq("id", data!.id);
      expect(deleteError).toBeNull();
      const { data: gone } = await admin.from("cases").select("id").eq("id", data!.id).maybeSingle();
      expect(gone).toBeNull();
    });

    it("refuses to let an admin pre-link a new case to somebody else's account", async () => {
      // Account linking is invitation acceptance (a service-role compare-and-swap, Stage 5),
      // never a field a consultancy can set on a stranger.
      const { error } = await adminA.client
        .from("cases")
        .insert({ organization_id: orgA, student_user_id: outsider.id, display_name: "Pre-linked" });
      expect(error?.code).toBe("42501");
    });

    it("refuses to let a counsellor create a case", async () => {
      const { error } = await counsellorA.client
        .from("cases")
        .insert({ organization_id: orgA, display_name: "Counsellor-created" });
      expect(error?.code).toBe("42501");
    });
  });

  // ===================================================================
  describe("team management stays inside the tenant", () => {
    it("lets an admin add a counsellor to their org but not to another", async () => {
      const { error } = await adminA.client
        .from("organization_memberships")
        .insert({ organization_id: orgA, user_id: outsider.id, role: "counsellor" });
      expect(error).toBeNull();
      await admin.from("organization_memberships").delete().eq("organization_id", orgA).eq("user_id", outsider.id);

      const { error: crossOrg } = await adminA.client
        .from("organization_memberships")
        .insert({ organization_id: orgB, user_id: outsider.id, role: "counsellor" });
      expect(crossOrg?.code).toBe("42501");
    });

    it("lets only an owner mint or change an owner membership", async () => {
      // An admin who could mint owners could then delete the organization — an in-tenant
      // escalation the case matrix says nothing about, closed here deliberately.
      const { error: byAdmin } = await adminA.client
        .from("organization_memberships")
        .insert({ organization_id: orgA, user_id: outsider.id, role: "owner" });
      expect(byAdmin?.code).toBe("42501");

      const { error: byOwner } = await ownerA.client
        .from("organization_memberships")
        .insert({ organization_id: orgA, user_id: outsider.id, role: "owner" });
      expect(byOwner).toBeNull();
      await admin.from("organization_memberships").delete().eq("organization_id", orgA).eq("user_id", outsider.id);
    });

    it("refuses to let a counsellor manage memberships at all", async () => {
      const { error } = await counsellorA.client
        .from("organization_memberships")
        .insert({ organization_id: orgA, user_id: outsider.id, role: "counsellor" });
      expect(error?.code).toBe("42501");
    });

    it("lets an admin assign an in-org counsellor to a case, never an outsider", async () => {
      const { error } = await adminA.client
        .from("case_assignments")
        .insert({ case_id: caseA2, user_id: counsellorLoner.id, assignment_role: "primary_counsellor" });
      // caseA2 already has a primary counsellor (revokedA), so this must be the only reason a
      // clash could appear — assert it is not a privilege refusal.
      expect(error?.code === "42501").toBe(false);
      if (!error) {
        await admin.from("case_assignments").delete().eq("case_id", caseA2).eq("user_id", counsellorLoner.id);
      }

      // Assigning a member of ANOTHER org would hand org A's case to org B's staff.
      const { error: outward } = await adminA.client
        .from("case_assignments")
        .insert({ case_id: caseA1, user_id: adminB.id, assignment_role: "primary_counsellor" });
      expect(outward?.code).toBe("42501");
    });

    it("refuses to let a counsellor assign themselves to a case", async () => {
      const { error } = await counsellorLoner.client
        .from("case_assignments")
        .insert({ case_id: caseA2, user_id: counsellorLoner.id, assignment_role: "primary_counsellor" });
      expect(error?.code).toBe("42501");
    });

    it("shows only an admin, and the assignee, an assignment row", async () => {
      const adminSees = await adminA.client.from("case_assignments").select("case_id, user_id");
      expect((adminSees.data ?? []).map((r) => r.case_id).sort()).toEqual([caseA1, caseA2].sort());

      const ownSees = await counsellorA.client.from("case_assignments").select("case_id");
      expect((ownSees.data ?? []).map((r) => r.case_id)).toEqual([caseA1]);

      const outsiderSees = await outsider.client.from("case_assignments").select("case_id");
      expect(outsiderSees.data ?? []).toEqual([]);
    });
  });

  // ===================================================================
  describe("invitations: admin create/list/revoke, acceptance closed, token_hash unreachable", () => {
    let invitationId: string;

    it("lets an org admin create and list an invitation", async () => {
      const { data, error } = await adminA.client
        .from("invitations")
        .insert({
          organization_id: orgA,
          email: `invitee-${stamp}@example.test`,
          role: "counsellor",
          token_hash: `mv152-hash-${stamp}`,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      invitationId = data!.id;

      const { data: listed } = await adminA.client.from("invitations").select("id, email");
      expect((listed ?? []).map((r) => r.id)).toEqual([invitationId]);
    });

    it("hides invitations — and therefore token_hash — from everyone but an org admin", async () => {
      for (const actor of [counsellorA, studentA, adminB, outsider]) {
        const { data, error } = await actor.client.from("invitations").select("id, token_hash");
        expect(error, `${actor.email} reading invitations`).toBeNull();
        expect(data ?? [], `${actor.email} must see no invitation`).toEqual([]);
      }
    });

    it("lets an admin revoke an invitation but never accept one", async () => {
      const { error: revoked } = await adminA.client
        .from("invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", invitationId);
      expect(revoked).toBeNull();

      // Acceptance is an atomic service-role compare-and-swap (Stage 5). A client that could
      // write accepted_at could accept an invitation it merely knows the id of.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: accepted } = await (adminA.client.from("invitations") as any)
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitationId);
      expect(accepted?.code).toBe("42501");
    });

    it("refuses to let a counsellor create an invitation", async () => {
      const { error } = await counsellorA.client.from("invitations").insert({
        organization_id: orgA,
        email: `sneaky-${stamp}@example.test`,
        role: "admin",
        token_hash: `mv152-sneaky-${stamp}`,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
      expect(error?.code).toBe("42501");
    });
  });

  // ===================================================================
  describe("audit_events: org-admin read, append-only preserved", () => {
    it("shows an org admin their own tenant's events and no others", async () => {
      const { data, error } = await adminA.client.from("audit_events").select("id, organization_id");
      expect(error).toBeNull();
      const orgs = new Set((data ?? []).map((r) => r.organization_id));
      expect(orgs.has(orgA)).toBe(true);
      expect(orgs.has(orgB)).toBe(false);
    });

    it("shows a counsellor and a student nothing", async () => {
      for (const actor of [counsellorA, studentA]) {
        const { data } = await actor.client.from("audit_events").select("id");
        expect(data ?? [], `${actor.email}`).toEqual([]);
      }
    });

    it("refuses an admin UPDATE, DELETE, or INSERT — append-only survived the policy swap", async () => {
      const [auditId] = seededAuditIds;
      const { error: update } = await adminA.client
        .from("audit_events")
        .update({ action: "tampered" })
        .eq("id", auditId!);
      expect(update?.code).toBe("42501");

      const { error: remove } = await adminA.client.from("audit_events").delete().eq("id", auditId!);
      expect(remove?.code).toBe("42501");

      const { error: insert } = await adminA.client
        .from("audit_events")
        .insert({ action: "forged", organization_id: orgA });
      expect(insert?.code).toBe("42501");
    });
  });

  // ===================================================================
  // Ordered last on purpose: it revokes a membership and leaves it revoked.
  describe("revocation takes effect immediately, with no session refresh", () => {
    it("drops an inactive member to zero rows on their very next query", async () => {
      // Same signed-in client throughout — the JWT is untouched, so anything that survived
      // would prove access is a token property rather than a row property.
      expect(await visibleCaseIds(revokedA)).toEqual([caseA2]);

      const { error } = await admin
        .from("organization_memberships")
        .update({ status: "inactive" })
        .eq("organization_id", orgA)
        .eq("user_id", revokedA.id);
      expect(error).toBeNull();

      expect(await visibleCaseIds(revokedA)).toEqual([]);
      const { data: orgs } = await revokedA.client.from("organizations").select("id");
      expect(orgs ?? []).toEqual([]);
      const { data: members } = await revokedA.client.from("organization_memberships").select("user_id");
      // Their own membership row stays visible (it is theirs, and the audit trail needs it to
      // survive) — but no co-member does.
      expect((members ?? []).map((r) => r.user_id)).toEqual([revokedA.id]);
    });
  });

  // ===================================================================
  describe("the predicates plan efficiently", () => {
    it("evaluates each helper once per statement and reaches cases by index, not a Seq Scan", () => {
      // A plan taken on a ten-row table proves nothing: the planner picks Seq Scan for any
      // predicate. Seed enough rows inside a rolled-back transaction that the index is the
      // cheaper option, then read the plan the authenticated user actually gets.
      //
      // TENANT COUNT is the load-bearing fixture parameter, not row count. Postgres cannot see
      // inside `= ANY ($initplan)`, so it falls back to assuming ~10 array elements: at 40
      // organizations that reads as ~22% of the table and a Seq Scan genuinely IS cheaper (and
      // measured faster). At 400 organizations — a realistic consultancy population — the same
      // predicate estimates ~2.5% and the BitmapOr wins. Shrinking this fixture would turn the
      // assertion below into a false alarm.
      const plan = execFileSync(
        "docker",
        [
          "exec",
          "-i",
          dbContainer,
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-tAX",
          "-v",
          "ON_ERROR_STOP=1",
          "-f",
          "-",
        ],
        {
          encoding: "utf8",
          input: `
            begin;
            insert into public.organizations (name, slug)
              select 'mv152 plan '||g, 'mv152-plan-${stamp}-'||g from generate_series(1, 400) g;
            insert into public.cases (organization_id, display_name)
              select o.id, 'plan case '||g
              from public.organizations o, generate_series(1, 25) g
              where o.slug like 'mv152-plan-${stamp}-%';
            analyze public.cases;
            analyze public.organization_memberships;
            set local request.jwt.claims = '{"sub":"${adminA.id}","role":"authenticated"}';
            set local role authenticated;
            explain (analyze, buffers) select id, display_name from public.cases;
            rollback;
          `,
        },
      );

      console.log(`\n[MV-152 EXPLAIN — list cases as an org admin, 400 orgs / 10k cases]\n${plan}`);

      expect(plan).not.toMatch(/Seq Scan on cases/);
      // One index per disjunct of the SELECT policy: the student link, the org-admin scope, and
      // the counsellor's assigned set. These are MV-150's indexes, doing the job they were
      // added for.
      expect(plan).toMatch(/Bitmap Index Scan on cases_student_user_id_idx/);
      expect(plan).toMatch(/Bitmap Index Scan on cases_organization_id_idx/);
      expect(plan).toMatch(/Bitmap Index Scan on cases_pkey/);
      // Three InitPlans = each helper ran ONCE for the whole statement. Without them the
      // definer helpers are called per row — the auth_rls_initplan finding at tenancy scale.
      expect(plan.match(/InitPlan \d/g)?.length).toBeGreaterThanOrEqual(3);
    });
  });
});
