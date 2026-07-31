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
 *  1. **`clientForUser` returns an RLS-scoped client, never the service-role admin.** The
 *     service role holds BYPASSRLS, so a tenancy assertion issued through it proves exactly
 *     nothing — it is the single defect most likely to produce a green suite that tests
 *     nothing (MV-153 card §Risk notes, "the service-role trap"). Every actor client here is
 *     built from the anon/publishable key plus that user's real signed-in JWT, and the suite
 *     asserts the `role` claim on each one before it asserts anything else.
 *
 *  2. **Denial is silent, so every denial is paired with a service-role existence proof.** An
 *     RLS SELECT refusal returns zero rows and no error — indistinguishable from an empty
 *     table, a fixture that never seeded, or a row an earlier test deleted. `proveExists`
 *     below THROWS when the row is genuinely missing, which converts "the fixture is lying"
 *     into a loud failure instead of a passing negative test.
 *
 *  3. **Probes restore what they touch.** The mutation probes capture the prior value, attempt
 *     the write, read the row back through the service role, and put it back. Delete and
 *     insert probes work on disposable clones so a cell that unexpectedly ALLOWS cannot
 *     destroy the fixture the remaining cells depend on.
 *
 * The localhost hard-guard from `anon-purge.itest.ts` is reproduced as `assertLocalStack`:
 * this factory mints ~17 auth users, writes across all six tenancy tables, flips memberships
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
 */
export const ACTOR_KEYS = [
  "ownerA",
  "adminA",
  "counsellorAssignedA",
  "counsellorUnassignedA",
  "studentA",
  "inactiveAssignedA",
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
  invitations: { teamA: string; teamB: string; studentB: string };
  auditEvents: { orgA: string; orgB: string };
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

  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

    const signIn = createClient<Database>(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session, error: signInError } = await signIn.auth.signInWithPassword({ email, password });
    if (signInError || !session.session) throw new Error(`failed to sign in ${label}: ${signInError?.message}`);

    return {
      key: label as ActorKey,
      id: data.user.id,
      email,
      accessToken: session.session.access_token,
      client: createClient<Database>(url, anonKey, {
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
      studentB: invitationIdFor("student-b"),
    },
    auditEvents,
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
   * A same-shape throwaway of a fixture case: same organization, same student link, same
   * assignment roster. Destructive probes (delete) and slot-consuming probes (assign) run
   * against the clone, so a cell that unexpectedly ALLOWS cannot take the fixture down with it.
   */
  const cloneCase = async (caseId: string, options: { withAssignments?: boolean } = {}): Promise<string> => {
    const { data: source, error } = await admin
      .from("cases")
      .select("organization_id, student_user_id")
      .eq("id", caseId)
      .single();
    if (error || !source) throw new Error(`could not clone case ${caseId}: ${error?.message}`);

    const { data: clone, error: cloneError } = await admin
      .from("cases")
      .insert({
        organization_id: source.organization_id,
        // The student link is deliberately dropped: `cases` carries no unique constraint on
        // it, but two rows claiming the same student is a shape the product never produces,
        // and no policy under test reads it for the delete/assign verbs.
        display_name: `clone ${nextTag()}`,
      })
      .select("id")
      .single();
    if (cloneError || !clone) throw new Error(`could not insert clone: ${cloneError?.message}`);
    disposableCaseIds.push(clone.id);

    if (options.withAssignments !== false) {
      const { data: assignments } = await admin.from("case_assignments").select("user_id").eq("case_id", caseId);
      for (const assignment of assignments ?? []) {
        await admin.from("case_assignments").insert({
          case_id: clone.id,
          user_id: assignment.user_id,
          assignment_role: "primary_counsellor",
        });
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

    /** Deletes a same-shape CLONE, never the fixture row. */
    async remove(actor: Actor, caseId: string): Promise<LayerOutcome> {
      await proveExists("cases", caseId);
      const clone = await cloneCase(caseId);
      const { error } = await actor.client.from("cases").delete().eq("id", clone);
      const { data: survivor } = await admin.from("cases").select("id").eq("id", clone).maybeSingle();
      const allowed = survivor === null;
      await dropClone(clone);
      return {
        allowed,
        how: allowed ? "clone deleted" : error ? `hard denial ${error.code}` : "silent USING miss (clone survived)",
      };
    },

    async assign(actor: Actor, caseId: string): Promise<LayerOutcome> {
      await proveExists("cases", caseId);
      const clone = await cloneCase(caseId, { withAssignments: false });
      const { error } = await actor.client.from("case_assignments").insert({
        case_id: clone,
        user_id: inOrgAssignee(caseId),
        assignment_role: "primary_counsellor",
      });
      const { data: landed } = await admin.from("case_assignments").select("id").eq("case_id", clone);
      const allowed = (landed ?? []).length > 0;
      await dropClone(clone);
      return { allowed, how: allowed ? "assignment row landed" : `rejected ${error?.code ?? "(no row, no error)"}` };
    },

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
      const { data: landed } = await admin.from("invitations").select("id").eq("token_hash", tag);
      const allowed = (landed ?? []).length > 0;
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
        const { data: real } = await admin.from("audit_events").select("id").eq("organization_id", organizationId);
        if ((real ?? []).length === 0) {
          throw new Error(`HARNESS DEFECT: no audit_events exist for ${organizationId}; "sees nothing" proves nothing`);
        }
      }
      return { allowed, how: allowed ? `${(data ?? []).length} event(s) returned` : "zero rows (events exist)" };
    },

    async manageTeam(actor: Actor, organizationId: string): Promise<LayerOutcome> {
      const { error } = await actor.client
        .from("organization_memberships")
        .insert({ organization_id: organizationId, user_id: fixture.actors.spare.id, role: "counsellor" });
      const { data: landed } = await admin
        .from("organization_memberships")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", fixture.actors.spare.id);
      const allowed = (landed ?? []).length > 0;
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
      const { data: after } = await admin.from("organizations").select("name").eq("id", organizationId).single();
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
