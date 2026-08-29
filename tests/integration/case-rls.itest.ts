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
 * Six cells here are fixed against the CANONICAL ACCESS MATRIX
 * (`docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md`), which is authoritative
 * over both this file and MV-151's TypeScript layer: organization settings are owner-only (1);
 * `archived_at` is owner/admin-only and the student's write surface is profile fields only
 * (2, 4); an assigned counsellor may invite their own student (3); an admin may not mint a
 * `role='owner'` invitation (5); and the dual-role rule — membership grants org rights while
 * active, the student link grants student rights on one case, additively, and revocation takes
 * only the first (6). Where this file and that one disagree, this file is wrong.
 *
 * DENIAL IS SILENT. An RLS SELECT refusal returns zero rows, no error — indistinguishable from
 * an empty table, a fixture that never seeded, or a row a previous test deleted. So every
 * "sees nothing" assertion below is paired with a service-role read (BYPASSRLS) proving the
 * rows exist, and usually with the actor who legitimately does see them. `expect(data).toEqual([])`
 * on its own is not evidence of a policy.
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
  ["can_staff_case", "uuid"],
  ["can_access_case", "uuid"],
  ["case_org_id", "uuid"],
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
  // Both at once: an active counsellor in org A (assigned caseA4) who is ALSO the linked
  // student of caseA3. The canonical matrix's dual-role rule lives or dies on this actor —
  // revoking the membership must take the staff half and leave the student half standing.
  let dualRole: Actor;
  // Org B — the neighbouring tenant. Everything it does to org A must fail.
  let adminB: Actor;
  // No membership anywhere.
  let outsider: Actor;

  let orgA: string;
  let orgB: string;
  let caseA1: string;
  let caseA2: string;
  let caseA3: string; // dualRole's own case — held as the student, not as staff
  let caseA4: string; // dualRole's assigned case — held as staff, not as the student
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

  const caseField = async (
    caseId: string,
    column: "display_name" | "organization_id" | "student_user_id" | "operational_status" | "archived_at",
  ) => {
    const { data, error } = await admin.from("cases").select(column).eq("id", caseId).single();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>)[column];
  };

  const orgName = async (orgId: string): Promise<string> => {
    const { data, error } = await admin.from("organizations").select("name").eq("id", orgId).single();
    if (error) throw new Error(error.message);
    return data.name;
  };

  /**
   * The service role's view of the same rows — the other half of every denial assertion here.
   *
   * An RLS SELECT denial is SILENT: zero rows, no error, indistinguishable from an empty table.
   * So `expect(data).toEqual([])` alone proves nothing — it passes just as happily if the
   * fixture never seeded the row, or if a previous test deleted it. Pairing it with the
   * service-role read (BYPASSRLS) turns "sees nothing" into "the rows exist and this actor is
   * being denied them", which is the claim actually worth making.
   */
  const assignmentCaseIdsAsServiceRole = async (userId: string): Promise<string[]> => {
    const { data, error } = await admin.from("case_assignments").select("case_id").eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => row.case_id).sort();
  };

  const invitationIdsAsServiceRole = async (): Promise<string[]> => {
    const { data, error } = await admin.from("invitations").select("id").like("token_hash", `mv152-%-${stamp}`);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => row.id).sort();
  };

  /** A distinct token_hash per invitation — the column is UNIQUE, so a collision reads as 23505. */
  const invitationFixture = (label: string, extra: Record<string, unknown>) => ({
    email: `${label}-${stamp}@example.test`,
    token_hash: `mv152-${label}-${stamp}`,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    ...extra,
  });

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    dbContainer = resolveDbContainer();
    anon = createClient<Database>(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });

    [ownerA, adminA, counsellorA, counsellorLoner, revokedA, studentA, dualRole, adminB, outsider] =
      await Promise.all([
        mintActor("owner-a"),
        mintActor("admin-a"),
        mintActor("counsellor-a"),
        mintActor("counsellor-loner"),
        mintActor("revoked-a"),
        mintActor("student-a"),
        mintActor("dual-role"),
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
    await seedMembership(orgA, dualRole.id, "counsellor");
    await seedMembership(orgB, adminB.id, "owner");

    caseA1 = await seedCase({ organization_id: orgA, student_user_id: studentA.id, display_name: "Case A1" });
    caseA2 = await seedCase({ organization_id: orgA, display_name: "Case A2 (unclaimed)" });
    // The two halves of the dual-role actor, deliberately on separate cases so revocation can be
    // observed taking one and leaving the other.
    caseA3 = await seedCase({ organization_id: orgA, student_user_id: dualRole.id, display_name: "Case A3 (own)" });
    caseA4 = await seedCase({ organization_id: orgA, display_name: "Case A4 (worked)" });
    caseB1 = await seedCase({ organization_id: orgB, display_name: "Case B1" });
    // organization_id null = the personal case an individual student drives themselves.
    casePersonal = await seedCase({ student_user_id: studentA.id, display_name: "Personal case" });

    const { error: assignError } = await admin.from("case_assignments").insert([
      { case_id: caseA1, user_id: counsellorA.id, assignment_role: "primary_counsellor" },
      { case_id: caseA2, user_id: revokedA.id, assignment_role: "primary_counsellor" },
      { case_id: caseA4, user_id: dualRole.id, assignment_role: "primary_counsellor" },
    ]);
    if (assignError) throw new Error(`failed to seed assignments: ${assignError.message}`);
    // caseA3 is left deliberately UNASSIGNED: it is both the dual-role student's own file and
    // the only case with a free `primary_counsellor` slot, which the assignment happy path below
    // needs (`case_assignments_primary_idx` allows exactly one per case).

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

    it("owns every definer helper with a role that actually holds BYPASSRLS", () => {
      // The whole anti-recursion mechanism rests on this and, until now, only asserted it in a
      // comment. A SECURITY DEFINER function executes as its OWNER; it is that owner's
      // BYPASSRLS — not ownership, which FORCE ROW LEVEL SECURITY deliberately defeats — that
      // stops the reads inside a membership helper being re-filtered by the policy that called
      // it (42P17). The migration now refuses to apply without it; this asserts the applied
      // state, so a future stack that grants the migration role less fails here rather than in
      // a browser.
      const rows = sql(`
        select p.proname || '|' || pg_catalog.pg_get_userbyid(p.proowner) || '|' || r.rolbypassrls::text
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join pg_roles r on r.oid = p.proowner
        where n.nspname = 'private' and p.prosecdef
          and p.proname in (${HELPERS.map(([name]) => `'${name}'`).join(",")})
        order by p.proname;
      `);
      expect(rows.length, "every helper must be SECURITY DEFINER and present").toBe(HELPERS.length);
      for (const row of rows) expect(row.endsWith("|true"), `definer helper owner lacks BYPASSRLS: ${row}`).toBe(true);
    });

    it("guards the cases write surface with an enabled, invoker, pinned-search_path trigger", () => {
      // RLS gates rows; this trigger is the column half (migration §5a). SECURITY INVOKER is
      // load-bearing — it is what lets the guard read the CALLER's role and exempt exactly the
      // BYPASSRLS roles RLS itself exempts. `O` = enabled for origin/local writes.
      const rows = sql(`
        select t.tgname || '|' || t.tgenabled::text || '|' || p.prosecdef::text || '|'
               || coalesce(array_to_string(p.proconfig, ','), 'NONE')
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = t.tgfoid
        where n.nspname = 'public' and c.relname = 'cases' and t.tgname = 'cases_write_surface_guard';
      `);
      expect(rows).toEqual([`cases_write_surface_guard|O|false|search_path=""`]);
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

      // The trigger guard is granted to authenticated (it is SECURITY INVOKER, so the updating
      // client needs EXECUTE), which makes it the one new function anon could inherit through
      // PUBLIC if the revoke were forgotten.
      expect(
        sqlOne(`select has_function_privilege('anon', 'private.enforce_case_write_surface()', 'execute')::text;`),
      ).toBe("false");
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
      expect(ids).toEqual(
        [ownerA.id, adminA.id, counsellorA.id, counsellorLoner.id, revokedA.id, dualRole.id].sort(),
      );
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
        expect(await visibleCaseIds(actor), `${actor.email}`).toEqual([caseA1, caseA2, caseA3, caseA4].sort());
      }
    });

    it("gives the dual-role actor the union of both halves, not the intersection", async () => {
      // caseA4 through the active membership + assignment; caseA3 through the student link. The
      // matrix's dual-role rule is ADDITIVE — holding a membership must not mask the rights a
      // person has over their own file, and holding the student link must not confer the org's.
      expect(await visibleCaseIds(dualRole)).toEqual([caseA3, caseA4].sort());
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
    it("lets an OWNER rename the organization, and refuses an admin", async () => {
      // Canonical matrix, divergence 1: "controls organization-level settings" is the owner's
      // line in the plan; the admin's is team access and cases. `slug` is in the same grant and
      // is the tenant's globally-unique URL identity, so this is not a cosmetic distinction.
      const renamed = `MV-152 Consultancy A renamed ${stamp}`;
      const { error } = await ownerA.client.from("organizations").update({ name: renamed }).eq("id", orgA);
      expect(error, `the owner must be able to rename their org: ${error?.message}`).toBeNull();
      expect(await orgName(orgA)).toBe(renamed);

      // The admin's UPDATE misses on USING: silent, zero rows, no error. The unchanged name is
      // the assertion — and the owner's successful rename immediately above is what proves the
      // write path works at all, so "unchanged" means denied rather than inert.
      const { error: byAdmin } = await adminA.client
        .from("organizations")
        .update({ name: `renamed by admin ${stamp}` })
        .eq("id", orgA);
      expect(byAdmin).toBeNull();
      expect(await orgName(orgA)).toBe(renamed);

      const { error: bySlug } = await adminA.client
        .from("organizations")
        .update({ slug: `mv152-org-a-hijacked-${stamp}` })
        .eq("id", orgA);
      expect(bySlug).toBeNull();
      expect(await orgName(orgA)).toBe(renamed);
    });

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
  // The COLUMN half of the cases write surface (canonical matrix, divergences 2 and 4).
  // cases_update_accessor admits the linked student on the student disjunct; without the
  // section-5a guard the flat column grant then hands them the whole counsellor write surface.
  // MV-196 narrowed that guard again: on a case a CONSULTANCY owns, a non-staff actor now writes
  // no column at all. The policy still admits the row on purpose — that is what keeps every
  // refusal below a 42501 rejection rather than a zero-row update nobody can tell from "absent".
  // Every refusal below is a RAISE with errcode 42501 — a hard rejection, never a silent no-op,
  // so each one is separable from "the row was not found".
  describe("the cases write surface is split by actor, not flat across authenticated", () => {
    it("MV-196: refuses the linked student EVERY column of a consultancy's case", async () => {
      // This test used to assert the opposite — that the student could edit the case's profile
      // fields — and that surface was designed at MV-152, when "linked student" could only mean
      // a student on a case they owned, because no student could accept an invitation until
      // MV-194. `caseA1` belongs to org A, so under Stage 5 this actor is the case's SUBJECT and
      // not its author (MV-195 decision D).
      //
      // A hard 42501 from the trigger rather than a filtered row: `cases_update_accessor` still
      // admits the student on the student disjunct, deliberately, so that the refusals in this
      // block stay REJECTIONS and never become silent no-ops indistinguishable from "not found".
      const renamed = `Student-edited A1 ${stamp}`;
      const before = await caseField(caseA1, "display_name");
      const { error } = await studentA.client.from("cases").update({ display_name: renamed }).eq("id", caseA1);
      expect(error, "a student writing a consultancy's case must be rejected, not silently applied").not.toBeNull();
      expect(error!.code).toBe("42501");
      expect(await caseField(caseA1, "display_name")).toBe(before);
    });

    it("refuses the linked student operational_status — the consultancy's own record", async () => {
      const before = await caseField(caseA1, "operational_status");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (studentA.client.from("cases") as any)
        .update({ operational_status: "closed" })
        .eq("id", caseA1);
      expect(error, "a student writing operational_status must be rejected, not silently applied").not.toBeNull();
      expect(error!.code).toBe("42501");
      expect(await caseField(caseA1, "operational_status")).toBe(before);
    });

    it("refuses the linked student archived_at, even bundled with a legitimate profile edit", async () => {
      // The bundling matters: PostgREST sends one UPDATE, and a guard that only inspected the
      // permitted column would let the archive ride along on it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (studentA.client.from("cases") as any)
        .update({ display_name: `bundled ${stamp}`, archived_at: new Date().toISOString() })
        .eq("id", caseA1);
      expect(error!.code).toBe("42501");
      expect(await caseField(caseA1, "archived_at")).toBeNull();
      expect(await caseField(caseA1, "display_name")).not.toBe(`bundled ${stamp}`);
    });

    it("refuses an assigned counsellor archived_at, while leaving operational_status theirs", async () => {
      // Divergence 2: the plan lists archive under the owner and gives the admin "all
      // organization cases". A counsellor works the case; they do not close the file.
      const { error: status } = await counsellorA.client
        .from("cases")
        .update({ operational_status: "ready_for_review" })
        .eq("id", caseA1);
      expect(status, `a counsellor must keep operational_status: ${status?.message}`).toBeNull();
      expect(await caseField(caseA1, "operational_status")).toBe("ready_for_review");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: archive } = await (counsellorA.client.from("cases") as any)
        .update({ archived_at: new Date().toISOString() })
        .eq("id", caseA1);
      expect(archive!.code).toBe("42501");
      expect(await caseField(caseA1, "archived_at")).toBeNull();
    });

    it("lets an org owner and an org admin archive, and un-archive, a case", async () => {
      for (const actor of [ownerA, adminA]) {
        const archivedAt = new Date().toISOString();
        const { error } = await actor.client.from("cases").update({ archived_at: archivedAt }).eq("id", caseA2);
        expect(error, `${actor.email} must be able to archive: ${error?.message}`).toBeNull();
        expect(await caseField(caseA2, "archived_at")).not.toBeNull();

        const { error: undo } = await actor.client.from("cases").update({ archived_at: null }).eq("id", caseA2);
        expect(undo, `${actor.email} must be able to un-archive: ${undo?.message}`).toBeNull();
        expect(await caseField(caseA2, "archived_at")).toBeNull();
      }
    });

    it("leaves an unrelated edit on an ALREADY-archived case alone", async () => {
      // The reason the guard is a BEFORE UPDATE trigger and not a WITH CHECK: a WITH CHECK sees
      // only NEW, so `archived_at is null or is_org_admin(...)` would reject this — somebody
      // renaming a case an admin archived — even though they change nothing.
      //
      // MV-196 moved the ACTOR here from `studentA` to the assigned counsellor. The property
      // under test is about the trigger's SHAPE (BEFORE UPDATE, comparing OLD to NEW) and needs
      // an actor who may legitimately write a profile field on this case at all; the student no
      // longer is one on a consultancy's case, so leaving them here would have re-tested MV-196's
      // new refusal and stopped testing the OLD-vs-NEW comparison entirely.
      const { error: archived } = await adminA.client
        .from("cases")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", caseA1);
      expect(archived).toBeNull();

      const renamed = `Renamed while archived ${stamp}`;
      const { error } = await counsellorA.client.from("cases").update({ display_name: renamed }).eq("id", caseA1);
      expect(error, `an untouched archived_at must not trip the guard: ${error?.message}`).toBeNull();
      expect(await caseField(caseA1, "display_name")).toBe(renamed);

      const { error: undo } = await adminA.client.from("cases").update({ archived_at: null }).eq("id", caseA1);
      expect(undo).toBeNull();
    });

    it("still lets service_role write both guarded columns — Stage 2 and Stage 5 depend on it", async () => {
      // The BEHAVIOURAL half of the exemption. Asserting `rolbypassrls` from the catalog proves
      // the roles are configured; it does not prove the guard consults it. Delete the
      // early-return from private.enforce_case_write_surface() and every catalog assertion below
      // still passes — but Stage 2's anonymous-claim path and Stage 5's invitation acceptance,
      // which run as service_role and must set operational_status, would break in production
      // with a green suite. This is the test that fails instead.
      const { error: status } = await admin
        .from("cases")
        .update({ operational_status: "waiting_on_student" })
        .eq("id", caseA2);
      expect(status, `service_role must keep the operational_status write: ${status?.message}`).toBeNull();
      expect(await caseField(caseA2, "operational_status")).toBe("waiting_on_student");

      const { error: archive } = await admin
        .from("cases")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", caseA2);
      expect(archive, `service_role must keep the archived_at write: ${archive?.message}`).toBeNull();
      expect(await caseField(caseA2, "archived_at")).not.toBeNull();

      await admin.from("cases").update({ archived_at: null, operational_status: "new" }).eq("id", caseA2);
    });

    it("still exempts the roles that bypass RLS — the guard is its column half, no wider", () => {
      // Stage 2's anonymous-claim path and Stage 5's invitation acceptance run as service_role
      // and must be able to set operational_status. The trigger reads the CALLER's rolbypassrls,
      // so its exemption set is exactly RLS's. (Contrast MV-150's append-only audit trigger,
      // which deliberately raises even for service_role.)
      expect(sqlOne(`select rolbypassrls::text from pg_roles where rolname = 'service_role';`)).toBe("true");
      expect(sqlOne(`select rolbypassrls::text from pg_roles where rolname = 'authenticated';`)).toBe("false");
      expect(
        sqlOne(`
          select p.prosecdef::text
          from pg_trigger t join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
          where n.nspname = 'public' and c.relname = 'cases' and t.tgname = 'cases_write_surface_guard';
        `),
        "the guard must be SECURITY INVOKER or it cannot see the caller's role",
      ).toBe("false");
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
      // caseA3, because it is the one case with a free `primary_counsellor` slot. The earlier
      // fixture aimed this at caseA2, which already had one: `case_assignments_primary_idx`
      // made it a guaranteed 23505, so the happy path could only ever be asserted as "at least
      // it was not a 42501" — a test that would have stayed green with the INSERT policy
      // deleted outright. Assert the insert SUCCEEDS, and that the row lands.
      const { error } = await adminA.client
        .from("case_assignments")
        .insert({ case_id: caseA3, user_id: counsellorLoner.id, assignment_role: "primary_counsellor" });
      expect(error, `assigning an in-org counsellor must succeed: ${error?.code} ${error?.message}`).toBeNull();
      expect(await assignmentCaseIdsAsServiceRole(counsellorLoner.id)).toEqual([caseA3]);
      await admin.from("case_assignments").delete().eq("case_id", caseA3).eq("user_id", counsellorLoner.id);

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

    it("shows an assignment row to consultancy staff on that case, and to nobody else", async () => {
      const adminSees = await adminA.client.from("case_assignments").select("case_id, user_id");
      expect((adminSees.data ?? []).map((r) => r.case_id).sort()).toEqual([caseA1, caseA2, caseA4].sort());

      const ownSees = await counsellorA.client.from("case_assignments").select("case_id");
      expect((ownSees.data ?? []).map((r) => r.case_id)).toEqual([caseA1]);

      const outsiderSees = await outsider.client.from("case_assignments").select("case_id");
      expect(outsiderSees.data ?? []).toEqual([]);
    });

    it("shows a linked student no assignment row, not even for their own case", async () => {
      // Who staffs a case is consultancy-internal operating data. The student disjunct grants
      // rights over the CASE, never over the organization's record of how it works that case
      // (matrix, divergence 6).
      const { data, error } = await studentA.client.from("case_assignments").select("case_id");
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
      // The distinguishing half: caseA1 really does have an assignment row, and the actor who
      // may see it does. Without this pair, the assertion above passes on an empty table.
      expect(await assignmentCaseIdsAsServiceRole(counsellorA.id)).toEqual([caseA1]);
      const { data: staffSees } = await counsellorA.client.from("case_assignments").select("case_id");
      expect((staffSees ?? []).map((r) => r.case_id)).toEqual([caseA1]);
    });
  });

  // ===================================================================
  describe("invitations: two shapes, two authorities, acceptance closed", () => {
    let teamInvitationId: string;
    let studentInvitationId: string;

    it("lets an org admin create and list a TEAM invitation", async () => {
      const { data, error } = await adminA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("team", { organization_id: orgA, role: "counsellor" }) as any)
        .select("id")
        .single();
      expect(error).toBeNull();
      teamInvitationId = data!.id;

      const { data: listed } = await adminA.client.from("invitations").select("id, email");
      expect((listed ?? []).map((r) => r.id)).toEqual([teamInvitationId]);
    });

    it("hides invitations — and therefore token_hash — from everyone with no authority over them", async () => {
      // counsellorA is deliberately absent: they hold a case-scoped carve-out, asserted
      // precisely in the next test. A team invite carries case_id null, so it is out of reach
      // for them either way.
      for (const actor of [studentA, adminB, outsider]) {
        const { data, error } = await actor.client.from("invitations").select("id, token_hash");
        expect(error, `${actor.email} reading invitations`).toBeNull();
        expect(data ?? [], `${actor.email} must see no invitation`).toEqual([]);
      }
      // Distinguishing "denied" from "no data": the row exists, and its holder can see it.
      expect(await invitationIdsAsServiceRole()).toEqual([teamInvitationId]);
    });

    it("lets an ASSIGNED counsellor invite the student for their own case", async () => {
      // Canonical matrix, divergence 3: the plan's counsellor "invites the student to
      // collaborate". SQL denied it; the plan makes it an explicit counsellor duty.
      const { data, error } = await counsellorA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("student", { case_id: caseA1, organization_id: orgA, role: "student" }) as any)
        .select("id")
        .single();
      expect(error, `the assigned counsellor must be able to invite their student: ${error?.message}`).toBeNull();
      studentInvitationId = data!.id;

      // The `.select()` above only returned because SELECT admits them too — an invite you
      // cannot read back is an invite you cannot chase or revoke, and PostgREST's
      // `return=representation` fails outright on it. The carve-out is strictly case-scoped:
      // the team invite from the first test stays invisible.
      const { data: listed } = await counsellorA.client.from("invitations").select("id");
      expect((listed ?? []).map((r) => r.id)).toEqual([studentInvitationId]);
      expect(await invitationIdsAsServiceRole()).toEqual([teamInvitationId, studentInvitationId].sort());

      // And they can revoke what they minted.
      const { error: revoked } = await counsellorA.client
        .from("invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", studentInvitationId);
      expect(revoked).toBeNull();
    });

    it("refuses a counsellor the student invite for a case they are not assigned to", async () => {
      const { error } = await counsellorA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("reach", { case_id: caseA2, organization_id: orgA, role: "student" }) as any);
      expect(error?.code).toBe("42501");

      // Membership alone is not the grant — the assignment is.
      const { error: loner } = await counsellorLoner.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("loner", { case_id: caseA1, organization_id: orgA, role: "student" }) as any);
      expect(loner?.code).toBe("42501");
    });

    it("refuses a linked student the invite verb on their own case", async () => {
      // The student disjunct is not a staff grant (matrix, divergence 6): the person invited to
      // a case does not get to invite others to it.
      const { error } = await studentA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("bystudent", { case_id: caseA1, organization_id: orgA, role: "student" }) as any);
      expect(error?.code).toBe("42501");
    });

    it("refuses an admin a role='owner' invitation, and allows the owner one", async () => {
      // Canonical matrix, divergence 5. organization_memberships already reserves owner rows to
      // owners; an unconstrained invitations INSERT walks around that carve-out by minting an
      // owner INVITATION instead — same escalation, different door.
      const { error: byAdmin } = await adminA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("ownerbyadmin", { organization_id: orgA, role: "owner" }) as any);
      expect(byAdmin?.code, "an admin minting an owner invitation must be rejected").toBe("42501");

      // An admin keeps every non-owner role, so this is a role constraint, not a lost verb.
      const { error: adminRole } = await adminA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("adminbyadmin", { organization_id: orgA, role: "admin" }) as any);
      expect(adminRole).toBeNull();

      const { error: byOwner } = await ownerA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("ownerbyowner", { organization_id: orgA, role: "owner" }) as any);
      expect(byOwner, `an owner must still be able to invite an owner: ${byOwner?.message}`).toBeNull();
    });

    it("refuses an admin the UN-revocation of an owner invitation", async () => {
      // The INSERT carve-out is only half a door. `revoked_at` is the one column in the grant
      // and it is BIDIRECTIONAL — setting it back to null resurrects the invitation. Without
      // the same carve-out on UPDATE, an admin who may not MINT an owner invitation just
      // un-revokes one an owner already revoked, and arrives at the same place one verb along.
      const { data: minted } = await ownerA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("ownerrevoke", { organization_id: orgA, role: "owner" }) as any)
        .select("id")
        .single();
      const ownerInviteId = minted!.id;
      const revokedAt = async (id: string) =>
        (await admin.from("invitations").select("revoked_at").eq("id", id).single()).data!.revoked_at;

      const { error: revoked } = await ownerA.client
        .from("invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", ownerInviteId);
      expect(revoked).toBeNull();

      // Silent USING miss, so the row is the assertion — and the owner's successful
      // un-revocation below is what proves the write path works rather than being inert.
      const { error: byAdmin } = await adminA.client
        .from("invitations")
        .update({ revoked_at: null })
        .eq("id", ownerInviteId);
      expect(byAdmin).toBeNull();
      expect(await revokedAt(ownerInviteId), "an admin must not resurrect an owner invitation").not.toBeNull();

      const { error: byOwner } = await ownerA.client
        .from("invitations")
        .update({ revoked_at: null })
        .eq("id", ownerInviteId);
      expect(byOwner).toBeNull();
      expect(await revokedAt(ownerInviteId), "an owner may still un-revoke their own").toBeNull();

      // The admin keeps the verb on every non-owner invitation — a role carve-out, not a lost
      // capability.
      const { error: nonOwner } = await adminA.client
        .from("invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", teamInvitationId);
      expect(nonOwner).toBeNull();
      expect(await revokedAt(teamInvitationId)).not.toBeNull();
    });

    it("refuses a student invitation stamped with another tenant's organization_id", async () => {
      // invitations_shape_check leaves organization_id unconstrained on a case invite, so
      // without the tie this row would be legal — and invitations_select_staff's org branch
      // would then show org B's admins a row (and a student's email) for a case in org A.
      const { error: crossOrg } = await adminA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("crossorg", { case_id: caseA1, organization_id: orgB, role: "student" }) as any);
      expect(crossOrg?.code).toBe("42501");

      // Null is not a wildcard either: caseA1's org is orgA, so a null org id is just as wrong.
      const { error: nullOrg } = await adminA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("nullorg", { case_id: caseA1, organization_id: null, role: "student" }) as any);
      expect(nullOrg?.code).toBe("42501");
    });

    it("lets an admin revoke an invitation but never accept one", async () => {
      const { error: revoked } = await adminA.client
        .from("invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", teamInvitationId);
      expect(revoked).toBeNull();

      // Acceptance is an atomic service-role compare-and-swap (Stage 5). A client that could
      // write accepted_at could accept an invitation it merely knows the id of.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: accepted } = await (adminA.client.from("invitations") as any)
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", teamInvitationId);
      expect(accepted?.code).toBe("42501");
    });

    it("refuses to let a counsellor create a TEAM invitation", async () => {
      const { error } = await counsellorA.client
        .from("invitations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(invitationFixture("sneaky", { organization_id: orgA, role: "admin" }) as any);
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

    it("stops a revoked member re-activating or promoting themselves", async () => {
      // The write half of "inactive membership grants nothing". `status` and `role` are both in
      // the column grant, and the revoked member can still SEE their own row — so if the UPDATE
      // policy leaned on that visibility instead of on actor_admin_org_ids, revocation would be
      // a suggestion. Their own row is readable; it is not writable by them.
      const reactivate = await revokedA.client
        .from("organization_memberships")
        .update({ status: "active" })
        .eq("organization_id", orgA)
        .eq("user_id", revokedA.id);
      expect(reactivate.error).toBeNull(); // silent USING miss
      const promote = await revokedA.client
        .from("organization_memberships")
        .update({ role: "owner" })
        .eq("organization_id", orgA)
        .eq("user_id", revokedA.id);
      expect(promote.error).toBeNull();
      const remove = await revokedA.client
        .from("organization_memberships")
        .delete()
        .eq("organization_id", orgA)
        .eq("user_id", revokedA.id);
      expect(remove.error).toBeNull();

      // The row is the assertion — untouched, still inactive, still a counsellor, still there.
      const { data } = await admin
        .from("organization_memberships")
        .select("status, role")
        .eq("organization_id", orgA)
        .eq("user_id", revokedA.id)
        .single();
      expect(data).toEqual({ status: "inactive", role: "counsellor" });
    });

    it("stops a revoked member reading the assignment rows they used to hold", async () => {
      // The predicate that used to grant this was `user_id = (select auth.uid())`, ungated on
      // membership status — so a fired counsellor kept the roster of every case they had worked,
      // indefinitely. "Inactive membership grants nothing" has to mean nothing.
      const { data, error } = await revokedA.client.from("case_assignments").select("case_id");
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
      // Denied, not merely absent: the row is still there, and adminA still reads it.
      expect(await assignmentCaseIdsAsServiceRole(revokedA.id)).toEqual([caseA2]);
      const { data: adminSees } = await adminA.client.from("case_assignments").select("case_id").eq("case_id", caseA2);
      expect((adminSees ?? []).map((r) => r.case_id)).toEqual([caseA2]);
    });

    it("takes the staff half from a dual-role actor and leaves their own case standing", async () => {
      // THE dual-role rule (canonical matrix, divergence 6, flagged there for founder override):
      // membership grants org-scoped rights while active, the student link grants student-scoped
      // rights on one case, the two are additive — and revoking staff access never removes a
      // person's rights over their own file. A fired counsellor loses the org; they do not lose
      // their own case.
      expect(await visibleCaseIds(dualRole)).toEqual([caseA3, caseA4].sort());
      const { data: assignedBefore } = await dualRole.client.from("case_assignments").select("case_id");
      expect((assignedBefore ?? []).map((r) => r.case_id)).toEqual([caseA4]);

      const { error } = await admin
        .from("organization_memberships")
        .update({ status: "inactive" })
        .eq("organization_id", orgA)
        .eq("user_id", dualRole.id);
      expect(error).toBeNull();

      // Student half: intact. This is the assertion the rule exists for.
      expect(await visibleCaseIds(dualRole)).toEqual([caseA3]);
      const stillMine = await dualRole.client.from("cases").select("id, display_name").eq("id", caseA3).single();
      expect(stillMine.error).toBeNull();
      expect(stillMine.data!.id).toBe(caseA3);

      // Staff half: gone, on the same signed-in client, with no session refresh.
      const { data: orgs } = await dualRole.client.from("organizations").select("id");
      expect(orgs ?? []).toEqual([]);
      const { data: assignedAfter } = await dualRole.client.from("case_assignments").select("case_id");
      expect(assignedAfter ?? []).toEqual([]);
      expect(await assignmentCaseIdsAsServiceRole(dualRole.id)).toEqual([caseA4]); // denied, not deleted
      const { data: coMembers } = await dualRole.client.from("organization_memberships").select("user_id");
      expect((coMembers ?? []).map((r) => r.user_id)).toEqual([dualRole.id]);

      // And the student link confers none of what the membership used to: caseA3 is in org A,
      // but its student cannot read org A, its team, or its other cases.
      const { data: siblings } = await dualRole.client.from("cases").select("id").eq("id", caseA4);
      expect(siblings ?? []).toEqual([]);
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

    it("keeps a cheap InitPlan disjunct in front of the per-row helper on the child tables", () => {
      // Both of these regressed during the matrix-alignment amendment and were caught only by
      // measuring. A per-row `can_staff_case` with nothing to short-circuit on took the
      // org-wide invitation list from 1.0 ms to 141.9 ms (3,000 student + 3,000 team invites)
      // and a counsellor's own-assignments list from 0.97 ms to 6.31 ms (100 of 5,000 rows).
      // The security predicate is unchanged either way — the InitPlan disjuncts are strict
      // SUBSETS of the helper — so nothing here trades safety for speed. Asserted structurally
      // from the plan rather than on a timing threshold, which would be flaky.
      const plans = execFileSync(
        "docker",
        ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAX", "-v", "ON_ERROR_STOP=1", "-f", "-"],
        {
          encoding: "utf8",
          input: `
            begin;
            insert into public.invitations (organization_id, case_id, email, role, token_hash, expires_at)
              select '${orgA}'::uuid, c.id, 'p@x.test', 'student', 'mv152-plan-s-${stamp}-'||c.id, now() + interval '1 day'
              from public.cases c where c.organization_id = '${orgA}'::uuid;
            insert into public.invitations (organization_id, email, role, token_hash, expires_at)
              select '${orgA}'::uuid, 'p@x.test', 'counsellor', 'mv152-plan-t-${stamp}-'||g, now() + interval '1 day'
              from generate_series(1, 500) g;
            analyze public.invitations;
            set local request.jwt.claims = '{"sub":"${adminA.id}","role":"authenticated"}';
            set local role authenticated;
            explain (analyze) select id from public.invitations;
            reset role;
            set local request.jwt.claims = '{"sub":"${counsellorA.id}","role":"authenticated"}';
            set local role authenticated;
            explain (analyze) select case_id from public.case_assignments where user_id = '${counsellorA.id}';
            rollback;
          `,
        },
      );

      // The org-admin disjunct must be reachable WITHOUT first proving `case_id is null`, or no
      // student invitation can ever short-circuit on it.
      expect(plans).toMatch(/organization_id = ANY \(\(InitPlan \d\)\.col1\)\)? OR/);
      // And the assignment predicate must lead with its InitPlan, not with the helper.
      expect(plans).toMatch(/case_id = ANY \(\(InitPlan \d\)\.col1\)\)? OR/);
    });
  });
});
