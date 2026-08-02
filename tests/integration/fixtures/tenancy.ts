/**
 * MV-153 — the two-organization tenancy fixture factory and the dual-layer probe machinery
 * that `tenant-isolation.itest.ts` drives.
 *
 * WHY THIS FILE EXISTS SEPARATELY: the suite asserts every matrix cell TWICE — once against
 * the TypeScript permission layer (MV-151) and once against the database (MV-152) — and that
 * only stays readable if the "how do I ask the database whether this actor may do X" logic
 * lives somewhere other than the matrix itself. The cell table in the itest is then a
 * declaration of the canonical access matrix, not a pile of PostgREST calls.
 *
 * Three properties here are load-bearing:
 *
 *  1. **Every client is RLS-scoped, never the service-role admin.** The service role holds
 *     BYPASSRLS, so a tenancy assertion issued through it proves exactly nothing — it is the
 *     single defect most likely to produce a green suite that tests nothing (MV-153 card
 *     §Risk notes, "the service-role trap"). `rawClient` below is the ONLY `createClient` call
 *     site in this file, `rlsClient` is the only way to mint a JWT-bearing one, and every
 *     client it mints is recorded in `issuedClients` so the suite's self-check can assert the
 *     property on the CLIENT (its reads are filtered) and not only on the TOKEN (its `role`
 *     claim reads `authenticated`). Those are different claims: a token can say
 *     `authenticated` while the client that issues the query carries the service key.
 *
 *  2. **Denial is silent, so every denial is paired with a service-role existence proof.** An
 *     RLS SELECT refusal returns zero rows and no error — indistinguishable from an empty
 *     table, a fixture that never seeded, or a row an earlier test deleted. `proveExists`
 *     below THROWS when the row is genuinely missing, which converts "the fixture is lying"
 *     into a loud failure instead of a passing negative test. Every service-role read-back
 *     goes through `svc`, which throws on error rather than letting a FAILED proof read as a
 *     definite "the write did not land".
 *
 *  3. **Probes restore what they touch, and the disposable rows they touch carry the same
 *     facts as the rows they stand in for.** The mutation probes capture the prior value,
 *     attempt the write, read the row back through the service role, and put it back. Delete
 *     and insert probes work on clones so a cell that unexpectedly ALLOWS cannot destroy the
 *     fixture the remaining cells depend on — and `cloneCase` copies `organization_id`,
 *     `student_user_id` AND the assignment roster, so the clone is indistinguishable from its
 *     source under every predicate those verbs could read (see the comment on `cloneCase`:
 *     round 1 dropped the student link, which made a whole family of cells assert something
 *     other than their own name).
 *
 * The localhost hard-guard from `anon-purge.itest.ts` is reproduced as `assertLocalStack`:
 * this factory mints ~19 auth users, writes across all six tenancy tables, flips memberships
 * to inactive, and cascade-deletes organizations. Pointed at a real project by a stale
 * `SUPABASE_TEST_URL` it would destroy consultancy records.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** The six tables Stage 1 must hold shut across a tenant boundary. */
export const TENANCY_TABLES = [
  "organizations",
  "organization_memberships",
  "cases",
  "case_assignments",
  "invitations",
  "audit_events",
] as const;
export type TenancyTable = (typeof TENANCY_TABLES)[number];

export type WriteVerb = "insert" | "update" | "delete";

/**
 * The write verbs `authenticated` ACTUALLY HOLDS, transcribed from the reviewed grant set in
 * `20260730180000_case_aware_rls_policies.sql` §9 — `grant select, delete on organizations`,
 * `grant select, insert, delete on organization_memberships`, the same on `case_assignments`,
 * `grant update (revoked_at) on invitations`, and so on.
 *
 * It lives here, next to the table list, because the card's criterion is "verified across all
 * six tenant tables" and round 1 met that for READS only: the single cross-org write test
 * covered seven verbs and silently omitted five, including `organizations` DELETE — total
 * tenant destruction, cascading every case, membership, assignment and invitation. The
 * cross-org catalogue in the suite records each verb it attempts and asserts the recorded set
 * EQUALS this one, so adding a grant without adding an assertion fails a test instead of
 * quietly widening the surface.
 */
export const GRANTED_WRITE_VERBS: Record<TenancyTable, readonly WriteVerb[]> = {
  organizations: ["update", "delete"],
  organization_memberships: ["insert", "update", "delete"],
  cases: ["insert", "update", "delete"],
  case_assignments: ["insert", "delete"],
  invitations: ["insert", "update"],
  // No write grant of any kind: `grant select on public.audit_events to authenticated`. The
  // refusal is the boundary, so the catalogue asserts all three verbs anyway.
  audit_events: [],
};

const isLocalStack = (u: string | undefined): boolean => {
  if (!u) return false;
  try {
    const { hostname } = new URL(u);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
};

/**
 * HARD localhost guard — not a comment, a gate. Call it at MODULE level so the suite refuses
 * to load, rather than at the first assertion, when `SUPABASE_TEST_URL` points anywhere but a
 * local stack.
 */
export function assertLocalStack(suiteName: string, url: string | undefined): void {
  if (url && !isLocalStack(url)) {
    throw new Error(
      `${suiteName} refuses to run against a non-local database (SUPABASE_TEST_URL=${url}). ` +
        "This suite mints and deletes auth users, writes across all six tenancy tables, revokes " +
        "memberships, and cascade-deletes organizations. Point it at a local `npx supabase start` " +
        "stack, or unset the variable.",
    );
  }
}

/**
 * Every actor the matrix reasons about.
 *
 * The four dual-role actors are the point of the fixture, not decoration — the canonical
 * matrix's divergence 6 is the one cell the plan did not settle, and it is only observable
 * with a person who holds two relationships at once:
 *  - `dualActiveA`   active counsellor AND the linked student of a DIFFERENT case
 *  - `dualInactiveA` REVOKED member who is the linked student of their own case
 *  - `inactiveAssignedA` revoked member still holding a `case_assignments` row, student of nothing
 *  - `revocableA`    active + assigned, flipped inactive mid-suite to prove immediacy
 *  - `crossTenantDual` org A ADMIN who is the linked student of an org **B** case — the
 *    sharpest shape available: a staff role must not follow a person into the tenant where
 *    they are the data subject, and being that data subject must not open that tenant.
 *
 * `inactiveOwnerA` and `inactiveAdminA` exist because every OTHER revoked actor here (and in
 * `case-rls.itest.ts`) is a counsellor, and a revoked counsellor exercises only ONE of the SQL
 * layer's two independent revocation gates:
 *
 *   * `actor_org_ids` / `actor_admin_org_ids` / `actor_owner_org_ids` /
 *     `actor_assigned_case_ids` each filter `status = 'active'` themselves — well covered.
 *   * `private.org_role` -> `private.is_org_admin` is the ONLY status filter behind
 *     `can_manage_case` (case_assignments INSERT/DELETE), `can_staff_case`'s admin disjunct
 *     (case_assignments SELECT, and the student-invite branch of invitations INSERT/SELECT/
 *     UPDATE), and the `archived_at` branch of `enforce_case_write_surface`. `is_org_admin` is
 *     false for a counsellor whatever their status, so no counsellor can ever catch a
 *     regression there. Delete `and m.status = 'active'` from `org_role` and, before these two
 *     actors existed, nothing in any suite went red.
 *
 * Both are also the LINKED STUDENT of their own case, which is what makes the gate observable
 * in isolation: the student link carries them past `cases_update_accessor`'s USING clause, so
 * an `archived_at` / `operational_status` write actually reaches the write-surface trigger,
 * whose only refusal on that path is `is_org_admin` / `can_staff_case`.
 */
export const ACTOR_KEYS = [
  "ownerA",
  "adminA",
  "counsellorAssignedA",
  "counsellorUnassignedA",
  "studentA",
  "inactiveAssignedA",
  "inactiveOwnerA",
  "inactiveAdminA",
  "dualActiveA",
  "dualInactiveA",
  "revocableA",
  "crossTenantDual",
  "ownerB",
  "adminB",
  "counsellorAssignedB",
  "studentB",
  "outsider",
  "forger",
  "spare",
] as const;
export type ActorKey = (typeof ACTOR_KEYS)[number];

/**
 * Cases in every shape the card enumerates: org case assigned, org case unassigned, unclaimed
 * student case (`student_user_id is null`), and personal case (`organization_id is null`).
 */
export const CASE_KEYS = [
  "orgAssignedA",
  "orgUnassignedA",
  "unclaimedA",
  "dualOwnA",
  "dualWorkA",
  "inactiveStudentA",
  "inactiveWorkA",
  "inactiveOwnerCaseA",
  "inactiveAdminCaseA",
  "revocableWorkA",
  "personalA",
  "orgAssignedB",
  "orgUnassignedB",
  "crossStudentB",
] as const;
export type CaseKey = (typeof CASE_KEYS)[number];

/** A signed-in actor: a real `authenticated` JWT, never the service-role client. */
export interface Actor {
  key: ActorKey;
  id: string;
  email: string;
  accessToken: string;
  client: SupabaseClient<Database>;
}

/** How one layer answered, with enough detail that a failure message is self-explaining. */
export interface LayerOutcome {
  allowed: boolean;
  how: string;
}

/**
 * A JWT-bearing client the suite has issued. Recorded so the harness self-check can prove the
 * property that matters — *this client's reads are filtered by RLS* — on every client that will
 * ever issue an assertion, including ones a single test builds for itself.
 */
export interface IssuedClient {
  label: string;
  token: string;
  client: SupabaseClient<Database>;
}

export interface TenancyFixture {
  /** Service-role client. Seeding, teardown, and existence proofs ONLY — never an assertion. */
  admin: SupabaseClient<Database>;
  /** Unauthenticated client, for the "anon holds nothing" assertions. */
  anon: SupabaseClient<Database>;
  stamp: number;
  orgA: string;
  orgB: string;
  actors: Record<ActorKey, Actor>;
  cases: Record<CaseKey, string>;
  /** The org each case belongs to; null for the personal case. */
  caseOrg: Record<CaseKey, string | null>;
  invitations: { teamA: string; teamB: string; studentA: string; studentB: string };
  auditEvents: { orgA: string; orgB: string };
  /**
   * Mint an RLS-scoped client for an arbitrary token AND record it. Tests that need their own
   * client (the tampered-JWT attacker) must come through here rather than calling
   * `createClient` themselves, so the self-check covers them too.
   */
  rlsClient: (label: string, token: string) => SupabaseClient<Database>;
  /** Every client `rlsClient` has minted so far, actor clients included. */
  issuedClients: IssuedClient[];
  /**
   * A throwaway organization with a membership set of the caller's choosing, registered for
   * teardown. The `organizations` DELETE probes need it: a delete that unexpectedly SUCCEEDS
   * cascades every case, membership, assignment and invitation of its tenant, so the probe
   * proving "an admin cannot destroy their OWN org" must not be aimed at org A.
   */
  seedDisposableOrg: (
    label: string,
    members: ReadonlyArray<{ userId: string; role: string; status?: "active" | "inactive" }>,
  ) => Promise<string>;
  teardown: () => Promise<void>;
}

interface MintOptions {
  appMetadata?: Record<string, unknown>;
  userMetadata?: Record<string, unknown>;
}

/** The `role` claim carried by a correctly-scoped actor JWT. */
export function jwtRoleClaim(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * Re-sign nothing: swap one claim in a real token and leave the ORIGINAL signature attached.
 * The result is a syntactically valid JWT whose signature no longer matches its payload —
 * exactly what an attacker who has their own session and wants somebody else's `sub` would
 * produce. GoTrue's secret is what must reject it.
 */
export function tamperJwtSubject(token: string, newSubject: string): string {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) throw new Error("not a JWT");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  claims.sub = newSubject;
  const forged = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${header}.${forged}.${signature}`;
}

export async function seedTenancyFixture(args: {
  url: string;
  serviceKey: string;
  anonKey: string;
}): Promise<TenancyFixture> {
  const { url, serviceKey, anonKey } = args;
  const stamp = Date.now();
  const password = `pw-${stamp}-Aa!`;

  /**
   * The ONLY `createClient` call site in this file, and the suite makes that structural: a
   * self-check counts the call sites in both files and fails if a second one appears. Without
   * that, a client minted inside a future test would sit outside `issuedClients` and outside
   * the BYPASSRLS check that is this harness's whole foundation.
   */
  const rawClient = (key: string, authorization?: string): SupabaseClient<Database> =>
    createClient<Database>(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}),
    });

  const issuedClients: IssuedClient[] = [];
  const rlsClient = (label: string, token: string): SupabaseClient<Database> => {
    const client = rawClient(anonKey, `Bearer ${token}`);
    issuedClients.push({ label, token, client });
    return client;
  };

  const admin = rawClient(serviceKey);
  const anon = rawClient(anonKey);

  const seededUserIds: string[] = [];
  const seededOrgIds: string[] = [];
  const seededCaseIds: string[] = [];
  const seededAuditIds: string[] = [];

  const mintNamed = async (label: string, options: MintOptions = {}): Promise<Actor> => {
    const email = `mv153-${label}-${stamp}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      ...(options.appMetadata ? { app_metadata: options.appMetadata } : {}),
      ...(options.userMetadata ? { user_metadata: options.userMetadata } : {}),
    });
    if (error || !data.user) throw new Error(`failed to mint ${label}: ${error?.message}`);
    seededUserIds.push(data.user.id);

    // A throwaway client for the sign-in round trip only: signing in on the shared `anon`
    // client would attach a session to it and quietly turn the "anon holds nothing" assertions
    // into "some authenticated user holds nothing".
    const signIn = rawClient(anonKey);
    const { data: session, error: signInError } = await signIn.auth.signInWithPassword({ email, password });
    if (signInError || !session.session) throw new Error(`failed to sign in ${label}: ${signInError?.message}`);

    return {
      key: label as ActorKey,
      id: data.user.id,
      email,
      accessToken: session.session.access_token,
      client: rlsClient(label, session.session.access_token),
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

  const seedMembership = async (
    organizationId: string,
    userId: string,
    role: string,
    status: "active" | "inactive" = "active",
  ): Promise<void> => {
    const { error } = await admin
      .from("organization_memberships")
      .insert({ organization_id: organizationId, user_id: userId, role, status });
    if (error) throw new Error(`failed to seed membership (${role}/${status}): ${error.message}`);
  };

  let disposableOrgSequence = 0;
  const seedDisposableOrg = async (
    label: string,
    members: ReadonlyArray<{ userId: string; role: string; status?: "active" | "inactive" }>,
  ): Promise<string> => {
    disposableOrgSequence += 1;
    const id = await seedOrg(
      `mv153-${label}-${stamp}-${disposableOrgSequence}`,
      `MV-153 disposable ${label} ${stamp}-${disposableOrgSequence}`,
    );
    for (const member of members) await seedMembership(id, member.userId, member.role, member.status ?? "active");
    return id;
  };

  // --- actors -------------------------------------------------------------------------
  const minted = await Promise.all(
    ACTOR_KEYS.map((key) =>
      key === "forger"
        ? // The role-forgery attacker: metadata that LOUDLY claims org-A ownership. Neither
          // layer may read a role from here (plan line 101) — authorization comes from
          // `organization_memberships` rows or it does not exist.
          mintNamed(key, {
            appMetadata: { role: "owner", is_admin: true, organization_role: "owner", memberships: ["*"] },
            userMetadata: { role: "owner", org_role: "admin", is_staff: true },
          })
        : mintNamed(key),
    ),
  );
  const actors = Object.fromEntries(
    ACTOR_KEYS.map((key, index) => [key, { ...minted[index]!, key }]),
  ) as Record<ActorKey, Actor>;

  // --- organizations + memberships ---------------------------------------------------
  const orgA = await seedOrg(`mv153-org-a-${stamp}`, `MV-153 Consultancy A ${stamp}`);
  const orgB = await seedOrg(`mv153-org-b-${stamp}`, `MV-153 Consultancy B ${stamp}`);

  await Promise.all([
    seedMembership(orgA, actors.ownerA.id, "owner"),
    seedMembership(orgA, actors.adminA.id, "admin"),
    seedMembership(orgA, actors.counsellorAssignedA.id, "counsellor"),
    seedMembership(orgA, actors.counsellorUnassignedA.id, "counsellor"),
    // Revoked before the first assertion: "inactive membership grants nothing" is a standing
    // state in the matrix, not only a transition. The transition is proven separately by
    // `revocableA`, which starts active and is flipped mid-suite.
    seedMembership(orgA, actors.inactiveAssignedA.id, "counsellor", "inactive"),
    // A revoked OWNER and a revoked ADMIN. See the ACTOR_KEYS comment: these two are the only
    // actors in either tenancy suite that can observe `private.org_role`'s status filter, which
    // is the sole revocation gate behind can_manage_case, can_staff_case's admin disjunct, and
    // the archived_at branch of the write-surface trigger.
    seedMembership(orgA, actors.inactiveOwnerA.id, "owner", "inactive"),
    seedMembership(orgA, actors.inactiveAdminA.id, "admin", "inactive"),
    seedMembership(orgA, actors.dualActiveA.id, "counsellor"),
    seedMembership(orgA, actors.dualInactiveA.id, "counsellor", "inactive"),
    seedMembership(orgA, actors.revocableA.id, "counsellor"),
    // Staff in org A, and nothing at all in org B — where they are merely a student.
    seedMembership(orgA, actors.crossTenantDual.id, "admin"),
    seedMembership(orgB, actors.ownerB.id, "owner"),
    seedMembership(orgB, actors.adminB.id, "admin"),
    seedMembership(orgB, actors.counsellorAssignedB.id, "counsellor"),
  ]);

  // --- cases, in every shape ----------------------------------------------------------
  const cases = {
    orgAssignedA: await seedCase({
      organization_id: orgA,
      student_user_id: actors.studentA.id,
      display_name: "A · assigned + linked",
    }),
    orgUnassignedA: await seedCase({ organization_id: orgA, display_name: "A · unassigned, unclaimed" }),
    // "Unclaimed student case": staffed by the consultancy, no student account attached yet.
    unclaimedA: await seedCase({ organization_id: orgA, display_name: "A · assigned, unclaimed" }),
    dualOwnA: await seedCase({
      organization_id: orgA,
      student_user_id: actors.dualActiveA.id,
      display_name: "A · dual-role actor's OWN case",
    }),
    dualWorkA: await seedCase({ organization_id: orgA, display_name: "A · dual-role actor's WORKED case" }),
    inactiveStudentA: await seedCase({
      organization_id: orgA,
      student_user_id: actors.dualInactiveA.id,
      display_name: "A · revoked member's OWN case",
    }),
    inactiveWorkA: await seedCase({ organization_id: orgA, display_name: "A · revoked member's worked case" }),
    // The revoked owner's / revoked admin's OWN case. The student link is what carries them
    // past `cases_update_accessor`'s USING clause so an archived_at or operational_status write
    // reaches `enforce_case_write_surface` — where `is_org_admin` / `can_staff_case`, i.e.
    // `org_role`'s status filter, is the only thing left to refuse them.
    inactiveOwnerCaseA: await seedCase({
      organization_id: orgA,
      student_user_id: actors.inactiveOwnerA.id,
      display_name: "A · revoked OWNER's own case",
    }),
    inactiveAdminCaseA: await seedCase({
      organization_id: orgA,
      student_user_id: actors.inactiveAdminA.id,
      display_name: "A · revoked ADMIN's own case",
    }),
    revocableWorkA: await seedCase({ organization_id: orgA, display_name: "A · revocation subject's case" }),
    // organization_id null = the personal case an individual student drives themselves.
    personalA: await seedCase({ student_user_id: actors.studentA.id, display_name: "Personal case" }),
    orgAssignedB: await seedCase({
      organization_id: orgB,
      student_user_id: actors.studentB.id,
      display_name: "B · assigned + linked",
    }),
    orgUnassignedB: await seedCase({ organization_id: orgB, display_name: "B · unassigned" }),
    crossStudentB: await seedCase({
      organization_id: orgB,
      student_user_id: actors.crossTenantDual.id,
      display_name: "B · case whose student is org A's admin",
    }),
  } satisfies Record<CaseKey, string>;

  const caseOrg: Record<CaseKey, string | null> = {
    orgAssignedA: orgA,
    orgUnassignedA: orgA,
    unclaimedA: orgA,
    dualOwnA: orgA,
    dualWorkA: orgA,
    inactiveStudentA: orgA,
    inactiveWorkA: orgA,
    inactiveOwnerCaseA: orgA,
    inactiveAdminCaseA: orgA,
    revocableWorkA: orgA,
    personalA: null,
    orgAssignedB: orgB,
    orgUnassignedB: orgB,
    crossStudentB: orgB,
  };

  // One `primary_counsellor` per case — `case_assignments_primary_idx` is partial-unique, so
  // the fixture keeps at most one assignment per case and probes clone rather than share.
  const { error: assignError } = await admin.from("case_assignments").insert([
    { case_id: cases.orgAssignedA, user_id: actors.counsellorAssignedA.id, assignment_role: "primary_counsellor" },
    { case_id: cases.unclaimedA, user_id: actors.counsellorAssignedA.id, assignment_role: "primary_counsellor" },
    { case_id: cases.dualWorkA, user_id: actors.dualActiveA.id, assignment_role: "primary_counsellor" },
    // A revoked member who still holds an assignment row: the row survives revocation (it is
    // history), and must confer nothing.
    { case_id: cases.inactiveWorkA, user_id: actors.inactiveAssignedA.id, assignment_role: "primary_counsellor" },
    { case_id: cases.revocableWorkA, user_id: actors.revocableA.id, assignment_role: "primary_counsellor" },
    { case_id: cases.orgAssignedB, user_id: actors.counsellorAssignedB.id, assignment_role: "primary_counsellor" },
  ]);
  if (assignError) throw new Error(`failed to seed assignments: ${assignError.message}`);

  // --- invitations + audit rows, so the cross-tenant read denials have something to deny ---
  const invitationRow = (label: string, extra: Record<string, unknown>) => ({
    email: `mv153-${label}-${stamp}@example.test`,
    token_hash: `mv153-${label}-${stamp}`,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    ...extra,
  });
  const { data: invitationRows, error: invitationError } = await admin
    .from("invitations")
    .insert([
      invitationRow("team-a", { organization_id: orgA, role: "counsellor" }),
      invitationRow("team-b", { organization_id: orgB, role: "counsellor" }),
      // An org A STUDENT invitation, so the second disjunct of invitations_select_staff /
      // _update_staff — `can_staff_case(case_id)`, whose admin half is gated only by
      // `org_role` — has a row on the org A side to be asked about. Without it a revoked org A
      // admin "sees no invitation" for the uninteresting reason that the only org A invitation
      // is a team invite, which the first (already status-gated) disjunct handles.
      invitationRow("student-a", { organization_id: orgA, case_id: cases.orgAssignedA, role: "student" }),
      invitationRow("student-b", { organization_id: orgB, case_id: cases.orgAssignedB, role: "student" }),
    ] as never)
    .select("id, token_hash");
  if (invitationError || !invitationRows) throw new Error(`failed to seed invitations: ${invitationError?.message}`);
  const invitationIdFor = (label: string): string => {
    const row = invitationRows.find((r) => r.token_hash === `mv153-${label}-${stamp}`);
    if (!row) throw new Error(`seeded invitation ${label} missing`);
    return row.id;
  };

  // audit_events carries no client INSERT grant — MV-150's `private.write_audit_event` is the
  // controlled write path — but that writer deliberately lives in the unexposed `private`
  // schema, so supabase-js cannot reach it as an RPC. The fixture therefore seeds through the
  // service role's BYPASSRLS insert, which the append-only trigger permits (it raises on
  // UPDATE and DELETE, not INSERT). These rows exist only to give the cross-tenant read
  // denials something real to deny.
  const writeAudit = async (action: string, organizationId: string): Promise<string> => {
    const { data, error } = await admin
      .from("audit_events")
      .insert({ action, organization_id: organizationId })
      .select("id")
      .single();
    if (error || !data) throw new Error(`failed to seed audit event: ${error?.message}`);
    return data.id;
  };
  const auditEvents = {
    orgA: await writeAudit("case.created", orgA),
    orgB: await writeAudit("case.created", orgB),
  };
  seededAuditIds.push(auditEvents.orgA, auditEvents.orgB);

  const teardown = async (): Promise<void> => {
    // Invitations, memberships, assignments and org cases cascade from the organization.
    if (seededOrgIds.length) await admin.from("organizations").delete().in("id", seededOrgIds);
    // The personal case has no organization to cascade from; clones registered by probes are
    // in this list too.
    if (seededCaseIds.length) await admin.from("cases").delete().in("id", seededCaseIds);
    if (seededAuditIds.length) await admin.from("audit_events").delete().in("id", seededAuditIds);
    for (const id of seededUserIds) await admin.auth.admin.deleteUser(id);
  };

  return {
    admin,
    anon,
    stamp,
    orgA,
    orgB,
    actors,
    cases,
    caseOrg,
    invitations: {
      teamA: invitationIdFor("team-a"),
      teamB: invitationIdFor("team-b"),
      studentA: invitationIdFor("student-a"),
      studentB: invitationIdFor("student-b"),
    },
    auditEvents,
    rlsClient,
    issuedClients,
    seedDisposableOrg,
    teardown,
  };
}

/**
 * The database half of every cell: one probe per verb, each returning a boolean plus the
 * evidence behind it.
 *
 * Every probe here issues its query through the ACTOR's client. The service role appears only
 * to prove a row exists (so a silent denial is distinguishable from an absent fixture), to read
 * a value back, and to clean up.
 */
export function createDbProbes(fixture: TenancyFixture) {
  const { admin } = fixture;
  let probeSequence = 0;
  const nextTag = (): string => `mv153-probe-${fixture.stamp}-${(probeSequence += 1)}`;
  const disposableCaseIds: string[] = [];

  /**
   * Every service-role read-back in this file goes through here. Reading `data` without
   * checking `error` turns a FAILED proof — a dropped connection, a renamed column, a
   * malformed filter — into a definite "the write did not land", which is a passing denial
   * manufactured by a broken harness. Three probes did exactly that in round 1.
   */
  const svc = async <T>(
    what: string,
    query: PromiseLike<{ data: T; error: { message: string } | null }>,
  ): Promise<T> => {
    const { data, error } = await query;
    if (error) {
      throw new Error(
        `HARNESS DEFECT: the service-role ${what} failed (${error.message}). A failed proof ` +
          "must never be read as a definite outcome — this probe can no longer tell you anything.",
      );
    }
    return data;
  };

  const svcRows = async <T>(
    what: string,
    query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> => (await svc(what, query)) ?? [];

  /** Turns "the fixture never seeded this" into a loud failure instead of a passing denial. */
  const proveExists = async (table: TenancyTable, id: string): Promise<void> => {
    const { data, error } = await admin.from(table).select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(`service-role existence proof failed on ${table}: ${error.message}`);
    if (!data) {
      throw new Error(
        `HARNESS DEFECT: ${table} row ${id} does not exist, so "sees nothing" proves nothing. ` +
          "A silent RLS denial and a missing fixture are the same observation — fix the fixture.",
      );
    }
  };

  const caseValue = async (caseId: string, column: "display_name" | "archived_at" | "operational_status") => {
    const { data, error } = await admin.from("cases").select(column).eq("id", caseId).single();
    if (error) throw new Error(`service-role read of cases.${column} failed: ${error.message}`);
    return (data as Record<string, unknown>)[column];
  };

  /**
   * A same-shape throwaway of a fixture case. Destructive probes (delete) and slot-consuming
   * probes (assign) run against the clone, so a cell that unexpectedly ALLOWS cannot take the
   * fixture down with it.
   *
   * "SAME SHAPE" IS LOAD-BEARING, and round 1 got it wrong. The clone deliberately dropped
   * `student_user_id`, so cells whose actor's ONLY relationship to the target is the student
   * link — `DENY studentA case.delete orgAssignedA`, whose rationale reads "a student never
   * deletes their own case" — actually asserted that a STRANGER cannot delete a case they have
   * no link to. The stated justification ("no policy under test reads the student link for
   * these verbs") was true of TODAY's policies, which is precisely the defect: the probe was
   * calibrated to the implementation it exists to falsify. Widen `cases_delete_admin` to
   * include `student_user_id = auth.uid()` and every one of those cells would still have
   * passed.
   *
   * The clone now carries every fact the delete/assign predicates could read —
   * `organization_id`, `student_user_id`, and the assignment roster — so it is
   * indistinguishable from its source under both the current policies and a widened one.
   *
   * `assignments: "drop"` exists for exactly one reason: `assignment_role` has a single legal
   * value and `case_assignments_primary_idx` is partial-unique on `case_id`, so a clone that
   * keeps the roster has no free slot for an INSERT probe to land in. That constraint is why
   * `assign` probes BOTH halves of the roster verb rather than only the insert — see there.
   */
  const cloneCase = async (caseId: string, options: { assignments?: "keep" | "drop" } = {}): Promise<string> => {
    const source = await svc(
      "clone source read",
      admin.from("cases").select("organization_id, student_user_id").eq("id", caseId).single(),
    );
    if (!source) throw new Error(`could not clone case ${caseId}: the source row is missing`);

    const clone = await svc(
      "clone insert",
      admin
        .from("cases")
        .insert({
          organization_id: source.organization_id,
          // `cases` carries no unique constraint on student_user_id, so the clone can hold the
          // same link as its source — which is the whole point (see above).
          student_user_id: source.student_user_id,
          display_name: `clone ${nextTag()}`,
        })
        .select("id")
        .single(),
    );
    if (!clone) throw new Error("could not insert clone");
    disposableCaseIds.push(clone.id);

    if ((options.assignments ?? "keep") === "keep") {
      const assignments = await svcRows(
        "clone roster read",
        admin.from("case_assignments").select("user_id").eq("case_id", caseId),
      );
      for (const assignment of assignments) {
        const { error } = await admin.from("case_assignments").insert({
          case_id: clone.id,
          user_id: assignment.user_id,
          assignment_role: "primary_counsellor",
        });
        if (error) throw new Error(`could not copy the assignment roster onto the clone: ${error.message}`);
      }
    }
    return clone.id;
  };

  const dropClone = async (caseId: string): Promise<void> => {
    await admin.from("cases").delete().eq("id", caseId);
  };

  /** An active counsellor inside the target case's organization — a legal assignee. */
  const inOrgAssignee = (caseId: string): string => {
    const key = (Object.keys(fixture.cases) as CaseKey[]).find((k) => fixture.cases[k] === caseId);
    const org = key ? fixture.caseOrg[key] : null;
    if (org === fixture.orgB) return fixture.actors.counsellorAssignedB.id;
    return fixture.actors.counsellorUnassignedA.id;
  };

  const orgOfCase = (caseId: string): string | null => {
    const key = (Object.keys(fixture.cases) as CaseKey[]).find((k) => fixture.cases[k] === caseId);
    return key ? fixture.caseOrg[key] : null;
  };

  return {
    disposableCaseIds,

    // ---- case-scoped verbs ----------------------------------------------------------
    async read(actor: Actor, caseId: string): Promise<LayerOutcome> {
      const { data, error } = await actor.client.from("cases").select("id").eq("id", caseId);
      if (error) throw new Error(`a SELECT must never error under RLS, it filters: ${error.code} ${error.message}`);
      const allowed = (data ?? []).length > 0;
      if (!allowed) await proveExists("cases", caseId);
      return { allowed, how: allowed ? "row returned" : "zero rows (row exists via service role)" };
    },

    /** The profile-field write surface — `display_name`, which every case-holder may edit. */
    async update(actor: Actor, caseId: string): Promise<LayerOutcome> {
      const before = await caseValue(caseId, "display_name");
      const probeValue = nextTag();
      const { error } = await actor.client.from("cases").update({ display_name: probeValue }).eq("id", caseId);
      const after = await caseValue(caseId, "display_name");
      const allowed = after === probeValue;
      if (allowed) await admin.from("cases").update({ display_name: before as string }).eq("id", caseId);
      else await proveExists("cases", caseId);
      return {
        allowed,
        how: allowed
          ? "row updated"
          : error
            ? `hard denial ${error.code} (row unchanged)`
            : "silent USING miss (row unchanged, row exists)",
      };
    },

    /** `archived_at` — owner/admin only, enforced by the BEFORE UPDATE write-surface trigger. */
    async archive(actor: Actor, caseId: string): Promise<LayerOutcome> {
      const before = await caseValue(caseId, "archived_at");
      const { error } = await actor.client
        .from("cases")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", caseId);
      const after = await caseValue(caseId, "archived_at");
      const allowed = after !== before;
      if (allowed) await admin.from("cases").update({ archived_at: before as string | null }).eq("id", caseId);
      else await proveExists("cases", caseId);
      return {
        allowed,
        how: allowed
          ? "archived_at written"
          : error
            ? `hard denial ${error.code} (archived_at unchanged)`
            : "silent USING miss (archived_at unchanged)",
      };
    },

    /** Deletes a same-shape CLONE — same org, same student link, same roster — never the fixture row. */
    async remove(actor: Actor, caseId: string): Promise<LayerOutcome> {
      await proveExists("cases", caseId);
      const clone = await cloneCase(caseId);
      const { error } = await actor.client.from("cases").delete().eq("id", clone);
      const survivor = await svc(
        "delete read-back",
        admin.from("cases").select("id").eq("id", clone).maybeSingle(),
      );
      const allowed = survivor === null;
      await dropClone(clone);
      return {
        allowed,
        how: allowed ? "clone deleted" : error ? `hard denial ${error.code}` : "silent USING miss (clone survived)",
      };
    },

    /**
     * `case.assign` is the roster verb, and the roster has TWO halves — INSERT and DELETE on
     * `case_assignments` — gated by exactly one predicate, `private.can_manage_case`. Both are
     * probed, because neither alone is falsifiable:
     *
     *  - The INSERT half needs a FREE primary slot (`assignment_role` has one legal value;
     *    `case_assignments_primary_idx` allows one holder per case), so its target cannot carry
     *    the source roster. For an actor whose only relationship to the case is their own
     *    assignment row, that target is a case they have no link to — a real denial, for the
     *    wrong reason.
     *  - The DELETE half's target carries the full roster, so that actor DOES hold the named
     *    relationship. Widen `can_manage_case` to assigned counsellors and this half turns
     *    green while the cell expects red. That is the mutation the insert-only probe missed.
     *
     * They are one verb, so they must agree. A split is a FINDING about the policies, not
     * something to average into a boolean, so it is raised rather than folded away.
     */
    async assign(actor: Actor, caseId: string): Promise<LayerOutcome> {
      await proveExists("cases", caseId);

      const addTarget = await cloneCase(caseId, { assignments: "drop" });
      const { error: addError } = await actor.client.from("case_assignments").insert({
        case_id: addTarget,
        user_id: inOrgAssignee(caseId),
        assignment_role: "primary_counsellor",
      });
      const added =
        (await svcRows("assignment insert read-back", admin.from("case_assignments").select("id").eq("case_id", addTarget)))
          .length > 0;
      await dropClone(addTarget);

      const dropTarget = await cloneCase(caseId, { assignments: "keep" });
      let roster = await svcRows(
        "clone roster read-back",
        admin.from("case_assignments").select("id").eq("case_id", dropTarget),
      );
      if (roster.length === 0) {
        // The source case has no roster, so the DELETE half would have nothing to aim at. Seed
        // one for a legal in-tenant assignee — never the actor — so the question stays "may
        // this actor take work off a case", not "may they resign".
        const { error } = await admin.from("case_assignments").insert({
          case_id: dropTarget,
          user_id: inOrgAssignee(caseId),
          assignment_role: "primary_counsellor",
        });
        if (error) throw new Error(`could not seed a delete target on the clone: ${error.message}`);
        roster = await svcRows(
          "seeded roster read-back",
          admin.from("case_assignments").select("id").eq("case_id", dropTarget),
        );
      }
      const { error: dropError } = await actor.client.from("case_assignments").delete().eq("case_id", dropTarget);
      const survivors = await svcRows(
        "assignment delete read-back",
        admin.from("case_assignments").select("id").eq("case_id", dropTarget),
      );
      const removed = survivors.length < roster.length;
      await dropClone(dropTarget);

      if (added !== removed) {
        throw new Error(
          `FINDING — not a harness defect: case_assignments INSERT and DELETE disagree for ${actor.key} ` +
            `on case ${caseId} (insert ${added ? "allowed" : "denied"}, delete ${removed ? "allowed" : "denied"}). ` +
            "Both are gated by private.can_manage_case alone, so the roster verb has split in two. " +
            "Report it — do not average it away.",
        );
      }
      return {
        allowed: added,
        how: added
          ? "assignment row landed, and an existing one could be removed"
          : `insert rejected ${addError?.code ?? "(no row, no error)"} · delete removed nothing (${
              dropError?.code ?? "silent USING miss"
            })`,
      };
    },

    /** Runs against the REAL case, not a clone: an invitation is additive and is cleaned up. */
    async inviteStudent(actor: Actor, caseId: string): Promise<LayerOutcome> {
      await proveExists("cases", caseId);
      const tag = nextTag();
      const { error } = await actor.client.from("invitations").insert({
        case_id: caseId,
        organization_id: orgOfCase(caseId),
        role: "student",
        email: `${tag}@example.test`,
        token_hash: tag,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      } as never);
      const landed = await svcRows(
        "invitation insert read-back",
        admin.from("invitations").select("id").eq("token_hash", tag),
      );
      const allowed = landed.length > 0;
      if (allowed) await admin.from("invitations").delete().eq("token_hash", tag);
      return { allowed, how: allowed ? "invitation row landed" : `rejected ${error?.code ?? "(no row, no error)"}` };
    },

    // ---- org-scoped verbs -----------------------------------------------------------
    async createCase(actor: Actor, organizationId: string): Promise<LayerOutcome> {
      const { data, error } = await actor.client
        .from("cases")
        .insert({ organization_id: organizationId, display_name: `created ${nextTag()}` })
        .select("id")
        .maybeSingle();
      const allowed = !error && data !== null;
      if (data) await admin.from("cases").delete().eq("id", data.id);
      return { allowed, how: allowed ? "case created" : `rejected ${error?.code ?? "(no row, no error)"}` };
    },

    async readAudit(actor: Actor, organizationId: string): Promise<LayerOutcome> {
      const { data, error } = await actor.client
        .from("audit_events")
        .select("id")
        .eq("organization_id", organizationId);
      if (error) throw new Error(`a SELECT must never error under RLS: ${error.code} ${error.message}`);
      const allowed = (data ?? []).length > 0;
      if (!allowed) {
        const real = await svcRows(
          "audit_events existence proof",
          admin.from("audit_events").select("id").eq("organization_id", organizationId),
        );
        if (real.length === 0) {
          throw new Error(`HARNESS DEFECT: no audit_events exist for ${organizationId}; "sees nothing" proves nothing`);
        }
      }
      return { allowed, how: allowed ? `${(data ?? []).length} event(s) returned` : "zero rows (events exist)" };
    },

    async manageTeam(actor: Actor, organizationId: string): Promise<LayerOutcome> {
      const { error } = await actor.client
        .from("organization_memberships")
        .insert({ organization_id: organizationId, user_id: fixture.actors.spare.id, role: "counsellor" });
      const landed = await svcRows(
        "membership insert read-back",
        admin
          .from("organization_memberships")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("user_id", fixture.actors.spare.id),
      );
      const allowed = landed.length > 0;
      if (allowed) {
        await admin
          .from("organization_memberships")
          .delete()
          .eq("organization_id", organizationId)
          .eq("user_id", fixture.actors.spare.id);
      }
      return { allowed, how: allowed ? "membership row landed" : `rejected ${error?.code ?? "(no row, no error)"}` };
    },

    async orgSettings(actor: Actor, organizationId: string): Promise<LayerOutcome> {
      const { data: before, error: readError } = await admin
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();
      if (readError || !before) throw new Error(`could not read organization ${organizationId}`);
      const probeValue = nextTag();
      const { error } = await actor.client.from("organizations").update({ name: probeValue }).eq("id", organizationId);
      const after = await svc(
        "organization rename read-back",
        admin.from("organizations").select("name").eq("id", organizationId).single(),
      );
      const allowed = after?.name === probeValue;
      if (allowed) await admin.from("organizations").update({ name: before.name }).eq("id", organizationId);
      else await proveExists("organizations", organizationId);
      return {
        allowed,
        how: allowed
          ? "organization renamed"
          : error
            ? `hard denial ${error.code} (name unchanged)`
            : "silent USING miss (name unchanged)",
      };
    },

    /** Every case id this actor can actually see — the list surface, unfiltered by the caller. */
    async visibleCaseIds(actor: Actor): Promise<string[]> {
      const { data, error } = await actor.client.from("cases").select("id");
      if (error) throw new Error(`${actor.key} could not list cases: ${error.message}`);
      return (data ?? []).map((row) => row.id).sort();
    },
  };
}

export type DbProbes = ReturnType<typeof createDbProbes>;
