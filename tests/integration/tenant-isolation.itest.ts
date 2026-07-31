/**
 * MV-153 — Stage 1 exit gate: the cross-tenant negative-test harness and the positive
 * authorization matrix, asserted in BOTH layers against a real local Postgres.
 *
 * ## Why this suite exists, and why "both layers" is the whole point
 *
 * MV-151 (the TypeScript permission layer) and MV-152 (the SQL RLS policies) were built in
 * parallel by separate sessions, each encoding the same access model in a different language,
 * neither able to see the other. A cross-layer review found they DIVERGED IN SIX CELLS —
 * including cases where the database was MORE permissive than TypeScript, which is the
 * dangerous direction. Two review rounds caught it.
 *
 * A harness that tested one layer would have caught none of that. So every cell below is
 * asserted TWICE — once against the TypeScript decision, once against the database — inside
 * ONE test, against ONE canonical expectation taken from
 * `docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md`. When the layers
 * disagree the test fails and names the layer that drifted. That is the card's deliverable:
 * this class of bug becomes a CI failure instead of a review finding.
 *
 * ## How each layer is probed, and why they are genuinely independent
 *
 * - **The DB layer** is probed through `clientForUser` — the anon/publishable key plus that
 *   user's real signed-in JWT. Never the service-role admin, which holds BYPASSRLS and would
 *   make every "deny" test pass trivially while proving nothing (the card's highest-rated
 *   risk). `harness self-check` below asserts the `role` claim on every actor client before
 *   any matrix cell runs.
 *
 * - **The TS layer** is probed with the SERVICE-ROLE client injected as `getCaseContext`'s
 *   optional `db` argument. This is deliberate and is the only service-role use in an
 *   assertion path: it hands the permission layer an UNFILTERED view of the facts, which is
 *   exactly the condition under which it is the last line — RLS bypassed, or a future
 *   service-role code path. Probing it through the actor's RLS client instead would let RLS
 *   silently answer for it, and a TypeScript matrix bug would hide behind a correct policy.
 *
 * So each cell proves two independent claims: *even if RLS were bypassed, TypeScript denies*
 * and *even if TypeScript were bypassed, the database denies*.
 *
 * ## Denial is silent
 *
 * An RLS SELECT refusal returns ZERO ROWS and no error — indistinguishable from an empty
 * table, a fixture that never seeded, or a row a previous test deleted. Every read probe in
 * `fixtures/tenancy.ts` pairs a denial with a service-role existence proof that THROWS when
 * the row is genuinely absent, so `expect(allowed).toBe(false)` can never pass vacuously.
 * Hard denials (INSERT/UPDATE/DELETE and the `enforce_case_write_surface` trigger) assert the
 * `42501` code; USING misses are silent by design and assert the unchanged row instead.
 *
 * ## Relationship to `case-rls.itest.ts`
 *
 * MV-152's suite is the POLICY smoke: catalog shape, grants, anti-recursion, InitPlan
 * efficiency, and a first pass at behaviour. It is not duplicated here. This suite owns the
 * MATRIX: every role × every verb × every case shape, in both layers, plus the cross-tenant
 * negative catalogue and the dual-role sub-matrix.
 *
 * ## Explicitly deferred (see `DEFERRED_BY_DESIGN` at the foot — asserted as documentation)
 *
 * Storage guessed-path download denial (Stage 4); invitation expiry / replay / revocation
 * acceptance flows and repeated-invalid-token rate limiting (Stage 5); case export/download
 * cross-org denial (Stage 4/6); and the service-role-path denial test (Stage 1 ships no
 * runtime service-role case wrapper to invoke).
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
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));

import { checkCasePermission } from "@/lib/cases/require-permission";
import { checkOrgPermission } from "@/lib/cases/require-org-permission";
import type { CaseScopedPermission, OrgScopedPermission } from "@/lib/cases/permissions";
import {
  ACTOR_KEYS,
  CASE_KEYS,
  TENANCY_TABLES,
  assertLocalStack,
  createDbProbes,
  jwtRoleClaim,
  seedTenancyFixture,
  tamperJwtSubject,
  type Actor,
  type ActorKey,
  type CaseKey,
  type DbProbes,
  type LayerOutcome,
  type TenancyFixture,
} from "./fixtures/tenancy";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("tenant-isolation.itest.ts", url);

/**
 * The verbs with a Stage 1 database surface. `case.notes.internal` and `case.export` have
 * none — there is no notes table and no export path yet — so they are asserted in the
 * TypeScript layer only, and listed in `TS_ONLY_CELLS` so the gap is visible rather than
 * silently uncovered.
 */
const CASE_VERBS = [
  "case.read",
  "case.update",
  "case.archive",
  "case.delete",
  "case.assign",
  "case.invite_student",
] as const satisfies readonly CaseScopedPermission[];
type CaseVerb = (typeof CASE_VERBS)[number];

const ORG_VERBS = [
  "case.create",
  "org.audit.read",
  "org.manage",
  "org.settings",
] as const satisfies readonly OrgScopedPermission[];
type OrgVerb = (typeof ORG_VERBS)[number];

interface CaseCell {
  actor: ActorKey;
  verb: CaseVerb;
  target: CaseKey;
  expected: boolean;
  label: string;
  why: string;
}

interface OrgCell {
  actor: ActorKey;
  verb: OrgVerb;
  target: "orgA" | "orgB";
  expected: boolean;
  label: string;
  why: string;
}

/**
 * One (actor, case) row of the matrix: name the verbs the canonical model ALLOWS and every
 * other verb is asserted denied. Writing the table this way is deliberate — a new verb added
 * to `CASE_VERBS` defaults to "must be denied for everyone" until someone states otherwise,
 * which is the safe direction for a matrix that is also a security boundary.
 */
const caseRow = (actor: ActorKey, target: CaseKey, allowed: readonly CaseVerb[], why: string): CaseCell[] =>
  CASE_VERBS.map((verb) => ({
    actor,
    verb,
    target,
    expected: allowed.includes(verb),
    label: allowed.includes(verb) ? "ALLOW" : "DENY",
    why,
  }));

const orgRow = (actor: ActorKey, target: "orgA" | "orgB", allowed: readonly OrgVerb[], why: string): OrgCell[] =>
  ORG_VERBS.map((verb) => ({
    actor,
    verb,
    target,
    expected: allowed.includes(verb),
    label: allowed.includes(verb) ? "ALLOW" : "DENY",
    why,
  }));

const ALL_CASE_VERBS = CASE_VERBS;
const STAFF_ON_ASSIGNED = ["case.read", "case.update", "case.invite_student"] as const;
const STUDENT_ON_OWN = ["case.read", "case.update"] as const;

/**
 * THE MATRIX. Every expectation is the canonical access matrix, not either implementation —
 * where a layer disagrees with a row here, the layer is wrong (spec §"Why this document
 * exists").
 */
const CASE_CELLS: CaseCell[] = [
  // ---- org A staff and student on org A's flagship case (assigned + linked) -------------
  ...caseRow("ownerA", "orgAssignedA", ALL_CASE_VERBS, "owner: access all organization cases; export, archive, delete"),
  ...caseRow("adminA", "orgAssignedA", ALL_CASE_VERBS, "admin: access and manage all organization cases"),
  ...caseRow(
    "counsellorAssignedA",
    "orgAssignedA",
    STAFF_ON_ASSIGNED,
    "counsellor: assigned cases; invites the student (divergence 3); never archives (divergence 2) or deletes",
  ),
  ...caseRow("counsellorUnassignedA", "orgAssignedA", [], "counsellor: assigned-only — membership alone is not a grant"),
  ...caseRow(
    "studentA",
    "orgAssignedA",
    STUDENT_ON_OWN,
    "student: their linked case, permitted profile fields only (divergence 4); never invites, archives, or deletes",
  ),
  ...caseRow("inactiveAssignedA", "orgAssignedA", [], "inactive membership grants nothing"),
  ...caseRow("dualInactiveA", "orgAssignedA", [], "revoked member, not this case's student: nothing"),
  // ---- the neighbouring tenant, fully privileged inside its OWN org --------------------
  ...caseRow("ownerB", "orgAssignedA", [], "cross-org: org B's owner has no reach into org A"),
  ...caseRow("adminB", "orgAssignedA", [], "cross-org: org B's admin has no reach into org A"),
  ...caseRow("outsider", "orgAssignedA", [], "no membership anywhere: knowing a case id grants nothing"),
  ...caseRow("forger", "orgAssignedA", [], "forged app_metadata/user_metadata claiming org-A ownership grants nothing"),
  // ---- and the mirror: org A's privileged staff reaching into org B --------------------
  ...caseRow("ownerA", "orgAssignedB", [], "cross-org: org A's owner has no reach into org B"),
  ...caseRow("adminA", "orgAssignedB", [], "cross-org: org A's admin has no reach into org B"),
  ...caseRow("counsellorAssignedA", "orgAssignedB", [], "cross-org: an assignment in org A reaches nothing in org B"),
  ...caseRow("studentA", "orgAssignedB", [], "cross-org: a student link in org A reaches nothing in org B"),

  // ---- unclaimed student case (staffed, no student account attached yet) ---------------
  ...caseRow("ownerA", "unclaimedA", ALL_CASE_VERBS, "an unclaimed case is still an organization case"),
  ...caseRow("counsellorAssignedA", "unclaimedA", STAFF_ON_ASSIGNED, "assigned counsellor works an unclaimed case"),
  ...caseRow("counsellorUnassignedA", "unclaimedA", [], "unassigned counsellor: nothing, claimed or not"),
  ...caseRow("studentA", "unclaimedA", [], "student cross-case denial: another student's file"),
  ...caseRow("adminB", "unclaimedA", [], "cross-org denial on an unclaimed case"),

  // ---- org case with nobody attached ---------------------------------------------------
  ...caseRow("adminA", "orgUnassignedA", ALL_CASE_VERBS, "admin reaches every case in the org, assigned or not"),
  ...caseRow("counsellorAssignedA", "orgUnassignedA", [], "assigned to a DIFFERENT case: no reach here"),
  ...caseRow("studentA", "orgUnassignedA", [], "student cross-case denial"),
  ...caseRow("dualActiveA", "orgUnassignedA", [], "neither half of a dual-role actor reaches an unrelated case"),

  // ---- personal case: organization_id is null -----------------------------------------
  ...caseRow("studentA", "personalA", STUDENT_ON_OWN, "the student drives their own personal case"),
  ...caseRow("ownerA", "personalA", [], "a personal case belongs to no organization — a consultancy has no reach"),
  ...caseRow("adminA", "personalA", [], "a personal case belongs to no organization"),
  ...caseRow("outsider", "personalA", [], "a personal case is the student's alone"),

  // ---- the dual-role sub-matrix: ACTIVE staff who is also a linked student -------------
  ...caseRow(
    "dualActiveA",
    "dualOwnA",
    STUDENT_ON_OWN,
    "dual-role, student half: their own case grants student rights only — not the staff verbs",
  ),
  ...caseRow(
    "dualActiveA",
    "dualWorkA",
    STAFF_ON_ASSIGNED,
    "dual-role, staff half: an assigned case grants counsellor rights only — the student link does not extend here",
  ),
  ...caseRow("counsellorAssignedA", "dualOwnA", [], "a colleague's own case is not reachable without an assignment"),

  // ---- the dual-role sub-matrix: INACTIVE member who IS the linked student -------------
  ...caseRow(
    "dualInactiveA",
    "inactiveStudentA",
    STUDENT_ON_OWN,
    "revoking a membership never removes a person's rights over their OWN student case",
  ),
  ...caseRow("dualInactiveA", "inactiveWorkA", [], "the revoked member's org rights are gone"),

  // ---- inactive member assigned to a case they are NOT the student of: everything denied
  ...caseRow(
    "inactiveAssignedA",
    "inactiveWorkA",
    [],
    "a surviving case_assignments row confers nothing once the membership is inactive",
  ),
  ...caseRow("inactiveAssignedA", "inactiveStudentA", [], "revoked member, not this case's student: nothing"),

  // ---- the dual-role sub-matrix, ACROSS the tenant boundary --------------------------
  // Org A's ADMIN is the linked student of an org B case. The additive rule has to hold in
  // both directions here: their staff role must not follow them into org B, and being org B's
  // data subject must not hand them anything else of org B's.
  ...caseRow(
    "crossTenantDual",
    "crossStudentB",
    STUDENT_ON_OWN,
    "cross-tenant dual role: they are org B's STUDENT on this one case — student rights only, no admin verbs",
  ),
  ...caseRow(
    "crossTenantDual",
    "orgAssignedB",
    [],
    "cross-tenant dual role: being a student in org B opens exactly one case, never the tenant",
  ),
  ...caseRow(
    "crossTenantDual",
    "orgAssignedA",
    ALL_CASE_VERBS,
    "cross-tenant dual role: their org A admin rights are undiminished by being a student elsewhere",
  ),
];

const ORG_CELLS: OrgCell[] = [
  ...orgRow("ownerA", "orgA", ORG_VERBS, "owner: manages the organization and team, controls organization settings"),
  ...orgRow(
    "adminA",
    "orgA",
    ["case.create", "org.audit.read", "org.manage"],
    "admin: manages team access and cases — but NOT organization settings (divergence 1)",
  ),
  ...orgRow("counsellorAssignedA", "orgA", [], "counsellor: no organization-level verb at all"),
  ...orgRow("counsellorUnassignedA", "orgA", [], "counsellor: no organization-level verb at all"),
  ...orgRow("studentA", "orgA", [], "student: holds no membership row, so reaches no org-scoped claim"),
  ...orgRow("dualActiveA", "orgA", [], "dual-role: the student link confers no organization rights"),
  ...orgRow("dualInactiveA", "orgA", [], "inactive membership grants nothing at org level either"),
  ...orgRow("inactiveAssignedA", "orgA", [], "inactive membership grants nothing"),
  ...orgRow("ownerB", "orgA", [], "cross-org: org B's owner is nothing to org A"),
  ...orgRow("adminB", "orgA", [], "cross-org: org B's admin is nothing to org A"),
  ...orgRow("outsider", "orgA", [], "no membership anywhere"),
  ...orgRow("forger", "orgA", [], "forged metadata claiming org-A ownership grants nothing"),
  ...orgRow("ownerA", "orgB", [], "cross-org mirror: org A's owner is nothing to org B"),
  ...orgRow("adminA", "orgB", [], "cross-org mirror: org A's admin is nothing to org B"),
  ...orgRow(
    "crossTenantDual",
    "orgA",
    ["case.create", "org.audit.read", "org.manage"],
    "cross-tenant dual role: a full org A admin (settings still reserved to the owner)",
  ),
  ...orgRow(
    "crossTenantDual",
    "orgB",
    [],
    "cross-tenant dual role: being org B's student confers no organization-level verb there",
  ),
];

/**
 * Verbs with NO Stage 1 database surface — asserted in the TypeScript layer only, and listed
 * here so the gap is a documented fact rather than an accidental omission. `case.notes.internal`
 * has no notes table (Stage 3); `case.export` has no export path (Stage 4/6, deferred by the
 * card). When either lands, its rows move into `CASE_CELLS`.
 */
const TS_ONLY_CELLS: Array<{ actor: ActorKey; verb: CaseScopedPermission; target: CaseKey; expected: boolean }> = [
  { actor: "ownerA", verb: "case.notes.internal", target: "orgAssignedA", expected: true },
  { actor: "adminA", verb: "case.notes.internal", target: "orgAssignedA", expected: true },
  { actor: "counsellorAssignedA", verb: "case.notes.internal", target: "orgAssignedA", expected: true },
  { actor: "counsellorUnassignedA", verb: "case.notes.internal", target: "orgAssignedA", expected: false },
  { actor: "studentA", verb: "case.notes.internal", target: "orgAssignedA", expected: false },
  { actor: "adminB", verb: "case.notes.internal", target: "orgAssignedA", expected: false },
  { actor: "outsider", verb: "case.notes.internal", target: "orgAssignedA", expected: false },
  { actor: "dualInactiveA", verb: "case.notes.internal", target: "inactiveStudentA", expected: false },
  { actor: "ownerA", verb: "case.export", target: "orgAssignedA", expected: true },
  { actor: "adminA", verb: "case.export", target: "orgAssignedA", expected: true },
  { actor: "counsellorAssignedA", verb: "case.export", target: "orgAssignedA", expected: false },
  { actor: "studentA", verb: "case.export", target: "orgAssignedA", expected: false },
  { actor: "adminB", verb: "case.export", target: "orgAssignedA", expected: false },
  { actor: "outsider", verb: "case.export", target: "orgAssignedA", expected: false },
];

/** Deferred to a later stage BY THE CARD — recorded so a cold agent does not absorb them. */
const DEFERRED_BY_DESIGN = [
  "storage: guessed-path download denial → Stage 4",
  "invitations: expired / replayed / revoked / email-mismatch acceptance → Stage 5",
  "invitations: single acceptance under concurrency → Stage 5",
  "invitations: repeated-invalid-token rate limit + alert → Stage 5",
  "case export / download cross-org denial → Stage 4/6",
  "service-role case-authorization check on a privileged wrapper → the stage that ships the first wrapper",
] as const;

describe.skipIf(!url || !serviceKey || !anonKey)("MV-153 tenant isolation — both layers, one matrix", () => {
  let fixture: TenancyFixture;
  let probes: DbProbes;

  const actor = (key: ActorKey): Actor => fixture.actors[key];
  const caseId = (key: CaseKey): string => fixture.cases[key];
  const orgId = (key: "orgA" | "orgB"): string => (key === "orgA" ? fixture.orgA : fixture.orgB);

  /**
   * The TypeScript layer, asked with an UNFILTERED view of the facts (see the file header).
   * This is the only service-role client in an assertion path, and it is what makes the two
   * layers independent rather than one wrapping the other.
   */
  const tsCase = async (key: ActorKey, target: CaseKey, verb: CaseScopedPermission): Promise<LayerOutcome> => {
    const { decision } = await checkCasePermission(actor(key).id, caseId(target), verb, fixture.admin);
    return { allowed: decision.allowed, how: decision.allowed ? "allowed" : `denied (${decision.reason})` };
  };

  const tsOrg = async (key: ActorKey, target: "orgA" | "orgB", verb: OrgScopedPermission): Promise<LayerOutcome> => {
    const { decision } = await checkOrgPermission(actor(key).id, orgId(target), verb, fixture.admin);
    return { allowed: decision.allowed, how: decision.allowed ? "allowed" : `denied (${decision.reason})` };
  };

  const dbCase = (verb: CaseVerb): ((a: Actor, id: string) => Promise<LayerOutcome>) => {
    switch (verb) {
      case "case.read":
        return probes.read;
      case "case.update":
        return probes.update;
      case "case.archive":
        return probes.archive;
      case "case.delete":
        return probes.remove;
      case "case.assign":
        return probes.assign;
      case "case.invite_student":
        return probes.inviteStudent;
    }
  };

  const dbOrg = (verb: OrgVerb): ((a: Actor, id: string) => Promise<LayerOutcome>) => {
    switch (verb) {
      case "case.create":
        return probes.createCase;
      case "org.audit.read":
        return probes.readAudit;
      case "org.manage":
        return probes.manageTeam;
      case "org.settings":
        return probes.orgSettings;
    }
  };

  beforeAll(async () => {
    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    probes = createDbProbes(fixture);
  }, 120_000);

  afterAll(async () => {
    if (!fixture) return;
    // Probe clones are dropped inline; this sweeps any left behind by a probe that threw.
    if (probes?.disposableCaseIds.length) {
      await fixture.admin.from("cases").delete().in("id", probes.disposableCaseIds);
    }
    await fixture.teardown();
  }, 120_000);

  // ===================================================================================
  // The suite is worthless if the actor clients are not what they claim to be. Assert that
  // before asserting anything with them.
  describe("harness self-check: the clients are RLS-scoped, not service-role", () => {
    it("carries an `authenticated` role claim on every actor JWT — never `service_role`", () => {
      for (const key of ACTOR_KEYS) {
        const claim = jwtRoleClaim(actor(key).accessToken);
        expect(claim, `${key} must sign in as authenticated, got ${claim}`).toBe("authenticated");
      }
    });

    it("seeds every case shape the matrix reasons about", async () => {
      for (const key of CASE_KEYS) {
        const { data } = await fixture.admin.from("cases").select("id").eq("id", caseId(key)).maybeSingle();
        expect(data, `case fixture ${key} missing`).not.toBeNull();
      }
      // The shapes themselves: an org case with an assignment AND a student, an org case with
      // neither, an unclaimed (student-less) case, and a personal (org-less) case.
      const { data: shapes } = await fixture.admin
        .from("cases")
        .select("id, organization_id, student_user_id")
        .in("id", CASE_KEYS.map(caseId));
      const rows = shapes ?? [];
      expect(rows.some((r) => r.organization_id !== null && r.student_user_id !== null)).toBe(true);
      expect(rows.some((r) => r.organization_id !== null && r.student_user_id === null)).toBe(true);
      expect(rows.some((r) => r.organization_id === null && r.student_user_id !== null)).toBe(true);
    });

    it("shows an unauthenticated client nothing on any of the six tenancy tables", async () => {
      for (const table of TENANCY_TABLES) {
        const { data, error } = await fixture.anon.from(table).select("id");
        // anon holds no grant at all, so this is a privilege refusal, not an empty result.
        expect(error?.code, `anon read of ${table}`).toBe("42501");
        expect(data ?? []).toEqual([]);
      }
    });
  });

  // ===================================================================================
  describe("the case matrix — every cell asserted in BOTH layers", () => {
    it.each(CASE_CELLS)("$label · $actor · $verb · $target", async (cell) => {
      const ts = await tsCase(cell.actor, cell.target, cell.verb);
      const db = await dbCase(cell.verb)(actor(cell.actor), caseId(cell.target));

      // One assertion over both layers: a failure diff names the layer that drifted, and a
      // layer-vs-layer divergence is impossible to read as a single-layer bug.
      expect(
        { typescript: ts.allowed, database: db.allowed },
        `${cell.why}\n  canonical: ${cell.label}\n  ts: ${ts.how}\n  db: ${db.how}`,
      ).toEqual({ typescript: cell.expected, database: cell.expected });
    });
  });

  // ===================================================================================
  describe("the organization matrix — every cell asserted in BOTH layers", () => {
    it.each(ORG_CELLS)("$label · $actor · $verb · $target", async (cell) => {
      const ts = await tsOrg(cell.actor, cell.target, cell.verb);
      const db = await dbOrg(cell.verb)(actor(cell.actor), orgId(cell.target));

      expect(
        { typescript: ts.allowed, database: db.allowed },
        `${cell.why}\n  canonical: ${cell.label}\n  ts: ${ts.how}\n  db: ${db.how}`,
      ).toEqual({ typescript: cell.expected, database: cell.expected });
    });
  });

  // ===================================================================================
  describe("verbs with no Stage 1 database surface — TypeScript layer only, by design", () => {
    it.each(TS_ONLY_CELLS)("$verb · $actor · $target → $expected", async (cell) => {
      const ts = await tsCase(cell.actor, cell.target, cell.verb);
      expect(ts.allowed, `${cell.verb} for ${cell.actor}: ${ts.how}`).toBe(cell.expected);
    });

    it("records what is deferred, so a cold agent does not read silence as coverage", () => {
      expect(DEFERRED_BY_DESIGN.length).toBe(6);
    });
  });

  // ===================================================================================
  // `case.list` is the one verb whose two layers answer different SHAPES: TypeScript returns
  // an allow plus a SCOPE the caller must still apply, while the database answers with the
  // rows it will actually hand over. Comparing booleans would be a category error, so the
  // comparison here is TS-scope → the exact expected row set.
  describe("case.list — the TypeScript scope must match the rows the database actually returns", () => {
    const LIST_EXPECTATIONS: Array<{
      actor: ActorKey;
      tsScope: "all-org" | "assigned" | "deny";
      visible: CaseKey[];
      why: string;
    }> = [
      {
        actor: "ownerA",
        tsScope: "all-org",
        visible: [
          "orgAssignedA",
          "orgUnassignedA",
          "unclaimedA",
          "dualOwnA",
          "dualWorkA",
          "inactiveStudentA",
          "inactiveWorkA",
          "revocableWorkA",
        ],
        why: "all-org: every org A case, and nothing of org B's, and not the personal case",
      },
      {
        actor: "adminA",
        tsScope: "all-org",
        visible: [
          "orgAssignedA",
          "orgUnassignedA",
          "unclaimedA",
          "dualOwnA",
          "dualWorkA",
          "inactiveStudentA",
          "inactiveWorkA",
          "revocableWorkA",
        ],
        why: "all-org",
      },
      {
        actor: "counsellorAssignedA",
        tsScope: "assigned",
        visible: ["orgAssignedA", "unclaimedA"],
        why: "assigned: the scope on the allow is the filter — never the org's whole caseload",
      },
      { actor: "counsellorUnassignedA", tsScope: "assigned", visible: [], why: "assigned to nothing sees nothing" },
      {
        actor: "dualActiveA",
        tsScope: "assigned",
        visible: ["dualWorkA", "dualOwnA"],
        why: "dual-role: the UNION of both halves — the assigned case and their own case",
      },
      {
        actor: "dualInactiveA",
        tsScope: "deny",
        visible: ["inactiveStudentA"],
        why: "revoked staff: no org list at all, but their own student case survives the revocation",
      },
      { actor: "inactiveAssignedA", tsScope: "deny", visible: [], why: "revoked, student of nothing: nothing" },
      {
        actor: "crossTenantDual",
        tsScope: "all-org",
        visible: [
          "orgAssignedA",
          "orgUnassignedA",
          "unclaimedA",
          "dualOwnA",
          "dualWorkA",
          "inactiveStudentA",
          "inactiveWorkA",
          "revocableWorkA",
          "crossStudentB",
        ],
        why: "the additive rule across tenants: every org A case as its admin, PLUS the one org B case they are the student of — and no other org B row",
      },
      {
        actor: "studentA",
        tsScope: "deny",
        visible: ["orgAssignedA", "personalA"],
        why: "a student holds no membership, so no org list — the rows they see are their own two cases",
      },
      {
        actor: "adminB",
        tsScope: "deny",
        visible: ["orgAssignedB", "orgUnassignedB", "crossStudentB"],
        why: "cross-org: org B's own caseload and nothing of org A's",
      },
      { actor: "outsider", tsScope: "deny", visible: [], why: "no membership anywhere" },
      { actor: "forger", tsScope: "deny", visible: [], why: "forged metadata lists nothing" },
    ];

    it.each(LIST_EXPECTATIONS)("$actor lists with scope $tsScope", async (expectation) => {
      const { decision } = await checkOrgPermission(
        actor(expectation.actor).id,
        fixture.orgA,
        "case.list",
        fixture.admin,
      );
      const tsScope = decision.allowed ? decision.requiredScope : "deny";
      expect(tsScope, `TS case.list scope for ${expectation.actor}`).toBe(expectation.tsScope);

      const visible = await probes.visibleCaseIds(actor(expectation.actor));
      expect(visible, expectation.why).toEqual(expectation.visible.map(caseId).sort());
    });

    it("never lets an org-A actor list an org-B case, or the reverse", async () => {
      const orgBCases = [caseId("orgAssignedB"), caseId("orgUnassignedB"), caseId("crossStudentB")];
      for (const key of ["ownerA", "adminA", "counsellorAssignedA", "studentA"] as const) {
        const visible = await probes.visibleCaseIds(actor(key));
        for (const id of orgBCases) expect(visible, `${key} must not list an org B case`).not.toContain(id);
      }
      for (const key of ["ownerB", "adminB"] as const) {
        const visible = await probes.visibleCaseIds(actor(key));
        expect(visible).toEqual(orgBCases.sort());
      }
    });
  });

  // ===================================================================================
  // The card's headline negative: knowing an id, or a table name, grants nothing across a
  // tenant boundary — proven table by table so no surface is assumed.
  describe("cross-org denial across all six tenancy tables", () => {
    const knownRowOf = (table: string): { id: string; column?: string } => {
      switch (table) {
        case "organizations":
          return { id: fixture.orgB };
        case "cases":
          return { id: caseId("orgAssignedB") };
        case "invitations":
          return { id: fixture.invitations.teamB };
        case "audit_events":
          return { id: fixture.auditEvents.orgB };
        default:
          return { id: "" };
      }
    };

    it.each(["ownerA", "adminA"] as const)(
      "%s — fully privileged inside org A — reads zero org-B rows from every table",
      async (key) => {
        const attacker = actor(key);

        for (const table of TENANCY_TABLES) {
          const known = knownRowOf(table);
          if (known.id) {
            // By a KNOWN id: the row exists (proven immediately below), the attacker gets
            // nothing. This is the "knowing an id grants nothing" claim.
            const { data, error } = await attacker.client.from(table).select("id").eq("id", known.id);
            expect(error, `a SELECT must filter, not error: ${table}`).toBeNull();
            expect(data ?? [], `${key} must not read ${table} row ${known.id}`).toEqual([]);

            const { data: proof } = await fixture.admin.from(table).select("id").eq("id", known.id).maybeSingle();
            expect(proof, `HARNESS DEFECT: ${table} row ${known.id} does not exist`).not.toBeNull();
          }
        }

        // The child tables have no single "org B id" column, so they are asserted by
        // org-scoped membership instead — and each is paired with the service-role proof.
        const { data: members } = await attacker.client
          .from("organization_memberships")
          .select("user_id")
          .eq("organization_id", fixture.orgB);
        expect(members ?? []).toEqual([]);
        const { data: memberProof } = await fixture.admin
          .from("organization_memberships")
          .select("user_id")
          .eq("organization_id", fixture.orgB);
        expect((memberProof ?? []).length, "HARNESS DEFECT: org B has no memberships").toBeGreaterThan(0);

        const { data: assignments } = await attacker.client
          .from("case_assignments")
          .select("case_id")
          .eq("case_id", caseId("orgAssignedB"));
        expect(assignments ?? []).toEqual([]);
        const { data: assignmentProof } = await fixture.admin
          .from("case_assignments")
          .select("case_id")
          .eq("case_id", caseId("orgAssignedB"));
        expect((assignmentProof ?? []).length, "HARNESS DEFECT: org B case has no assignment").toBeGreaterThan(0);
      },
    );

    it("hides org B's invitation token_hash and invitee email from org A entirely", async () => {
      // The invitation row is the most sensitive cross-tenant leak available in Stage 1: the
      // token_hash is the acceptance credential and the email identifies a student.
      for (const key of ["ownerA", "adminA", "counsellorAssignedA", "studentA", "outsider"] as const) {
        const { data, error } = await actor(key).client.from("invitations").select("id, token_hash, email");
        expect(error).toBeNull();
        const ids = (data ?? []).map((r) => r.id);
        expect(ids, `${key} must not see org B's team invitation`).not.toContain(fixture.invitations.teamB);
        expect(ids, `${key} must not see org B's student invitation`).not.toContain(fixture.invitations.studentB);
      }
      // Denied, not absent: org B's own admin does see them.
      const { data: ownerSees } = await actor("adminB").client.from("invitations").select("id");
      expect((ownerSees ?? []).map((r) => r.id).sort()).toEqual(
        [fixture.invitations.teamB, fixture.invitations.studentB].sort(),
      );
    });

    it("refuses every cross-org WRITE and leaves the row untouched", async () => {
      const attacker = actor("ownerA");

      // organizations: silent USING miss (the row is invisible, so the UPDATE matches nothing).
      const { data: before } = await fixture.admin.from("organizations").select("name").eq("id", fixture.orgB).single();
      await attacker.client.from("organizations").update({ name: "seized" }).eq("id", fixture.orgB);
      const { data: afterOrg } = await fixture.admin
        .from("organizations")
        .select("name")
        .eq("id", fixture.orgB)
        .single();
      expect(afterOrg?.name).toBe(before?.name);

      // organization_memberships: a hard 42501 — the WITH CHECK names an org they do not admin.
      const { error: memberInsert } = await attacker.client
        .from("organization_memberships")
        .insert({ organization_id: fixture.orgB, user_id: attacker.id, role: "owner" });
      expect(memberInsert?.code, "planting a membership in another tenant must be rejected").toBe("42501");

      // cases: creating a case inside org B.
      const { error: caseInsert } = await attacker.client
        .from("cases")
        .insert({ organization_id: fixture.orgB, display_name: "planted" });
      expect(caseInsert?.code).toBe("42501");

      // cases: moving one of ORG A's cases into org B — the tenant-escape write. The column is
      // not even in the client's UPDATE grant, so this is a hard refusal, not a silent miss.
      const { error: move } = await attacker.client
        .from("cases")
        .update({ organization_id: fixture.orgB })
        .eq("id", caseId("orgAssignedA"));
      expect(move?.code).toBe("42501");
      const { data: stillA } = await fixture.admin
        .from("cases")
        .select("organization_id")
        .eq("id", caseId("orgAssignedA"))
        .single();
      expect(stillA?.organization_id).toBe(fixture.orgA);

      // case_assignments: handing org A's staff an org B case.
      const { error: assign } = await attacker.client.from("case_assignments").insert({
        case_id: caseId("orgUnassignedB"),
        user_id: actor("counsellorUnassignedA").id,
        assignment_role: "primary_counsellor",
      });
      expect(assign?.code).toBe("42501");

      // audit_events: append-only survives the tenant boundary in both directions.
      const { error: auditUpdate } = await attacker.client
        .from("audit_events")
        .update({ action: "tampered" })
        .eq("id", fixture.auditEvents.orgB);
      expect(auditUpdate?.code).toBe("42501");
      const { error: auditDelete } = await attacker.client
        .from("audit_events")
        .delete()
        .eq("id", fixture.auditEvents.orgB);
      expect(auditDelete?.code).toBe("42501");

      // cases: deleting org B's case.
      const { error: del } = await attacker.client.from("cases").delete().eq("id", caseId("orgAssignedB"));
      expect(del).toBeNull(); // silent USING miss
      const { data: survivor } = await fixture.admin
        .from("cases")
        .select("id")
        .eq("id", caseId("orgAssignedB"))
        .maybeSingle();
      expect(survivor, "org B's case must survive org A's delete").not.toBeNull();
    });
  });

  // ===================================================================================
  describe("student cross-case denial", () => {
    it("shows a student nothing of another student's case, in either layer", async () => {
      const student = actor("studentA");
      const foreign = caseId("orgAssignedB");
      const sibling = caseId("unclaimedA"); // same organization, different file

      for (const target of [foreign, sibling]) {
        const { data } = await student.client.from("cases").select("id").eq("id", target);
        expect(data ?? []).toEqual([]);
        const { data: proof } = await fixture.admin.from("cases").select("id").eq("id", target).maybeSingle();
        expect(proof, "HARNESS DEFECT: target case missing").not.toBeNull();
      }

      const { decision } = await checkCasePermission(student.id, sibling, "case.read", fixture.admin);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("no-relationship");
    });

    it("shows a student no audit trail and no other member's membership row", async () => {
      const student = actor("studentA");

      const { data: audit } = await student.client.from("audit_events").select("id");
      expect(audit ?? [], "consultancy-internal audit data is invisible to a student").toEqual([]);
      const { data: auditProof } = await fixture.admin.from("audit_events").select("id").eq("id", fixture.auditEvents.orgA);
      expect(auditProof ?? [], "HARNESS DEFECT: org A audit row missing").not.toEqual([]);

      const { data: members } = await student.client.from("organization_memberships").select("user_id");
      expect(members ?? [], "a student holds no membership row, so sees none").toEqual([]);
      const { data: memberProof } = await fixture.admin
        .from("organization_memberships")
        .select("user_id")
        .eq("organization_id", fixture.orgA);
      expect((memberProof ?? []).length, "HARNESS DEFECT: org A has no memberships").toBeGreaterThan(0);

      // And who staffs their own case is consultancy-internal operating data.
      const { data: assignments } = await student.client.from("case_assignments").select("case_id");
      expect(assignments ?? []).toEqual([]);
    });
  });

  // ===================================================================================
  // The COLUMN half of the boundary. `cases_update_accessor` admits the student and the
  // assigned counsellor on the same row; the BEFORE UPDATE trigger is what splits the write
  // surface between them. Every refusal here is a hard 42501, never a silent no-op, so it is
  // separable from "the row was not found".
  describe("the write-surface intersection: who may write which column of a case they can reach", () => {
    const statusOf = async (id: string): Promise<string> => {
      const { data } = await fixture.admin.from("cases").select("operational_status").eq("id", id).single();
      return data!.operational_status;
    };
    const archivedOf = async (id: string): Promise<string | null> => {
      const { data } = await fixture.admin.from("cases").select("archived_at").eq("id", id).single();
      return data!.archived_at;
    };

    it("gives the assigned counsellor operational_status but never archived_at", async () => {
      const target = caseId("orgAssignedA");
      const { error: status } = await actor("counsellorAssignedA")
        .client.from("cases")
        .update({ operational_status: "in_progress" })
        .eq("id", target);
      expect(status, "a counsellor works the case: operational_status is theirs").toBeNull();
      expect(await statusOf(target)).toBe("in_progress");

      const { error: archive } = await actor("counsellorAssignedA")
        .client.from("cases")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", target);
      expect(archive?.code, "archive is an owner/admin verb (divergence 2)").toBe("42501");
      expect(await archivedOf(target)).toBeNull();

      await fixture.admin.from("cases").update({ operational_status: "new" }).eq("id", target);
    });

    it("refuses the linked student BOTH consultancy columns, even bundled with a legitimate edit", async () => {
      const target = caseId("orgAssignedA");
      const student = actor("studentA");

      const { error: status } = await student.client
        .from("cases")
        .update({ operational_status: "closed" })
        .eq("id", target);
      expect(status?.code, "operational_status is the consultancy's record (divergence 4)").toBe("42501");
      expect(await statusOf(target)).toBe("new");

      // Bundling matters: PostgREST sends ONE update, and a guard that only inspected the
      // permitted column would let the archive ride along on it.
      const { error: bundled } = await student.client
        .from("cases")
        .update({ display_name: `bundled ${fixture.stamp}`, archived_at: new Date().toISOString() })
        .eq("id", target);
      expect(bundled?.code).toBe("42501");
      expect(await archivedOf(target)).toBeNull();
    });

    it("splits the write surface for a DUAL-ROLE actor by which relationship reaches the row", async () => {
      // The intersection cell the canonical matrix's divergence 6 implies but never spells
      // out: the same person, two cases, two different column surfaces.
      const own = caseId("dualOwnA"); // reached as the STUDENT (they are not assigned to it)
      const worked = caseId("dualWorkA"); // reached as an assigned COUNSELLOR
      const dual = actor("dualActiveA");

      // On their own case they are a student — even though they are also org A staff.
      const { error: ownStatus } = await dual.client
        .from("cases")
        .update({ operational_status: "closed" })
        .eq("id", own);
      expect(ownStatus?.code, "staff standing must not follow them onto their own file").toBe("42501");
      expect(await statusOf(own)).toBe("new");

      // On the case they work they are a counsellor — the status column is theirs.
      const { error: workedStatus } = await dual.client
        .from("cases")
        .update({ operational_status: "in_progress" })
        .eq("id", worked);
      expect(workedStatus, "the staff half must keep the counsellor write surface").toBeNull();
      expect(await statusOf(worked)).toBe("in_progress");

      // And neither relationship reaches `archived_at`, which is owner/admin only.
      for (const target of [own, worked]) {
        const { error } = await dual.client
          .from("cases")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", target);
        expect(error?.code, "no counsellor and no student archives").toBe("42501");
        expect(await archivedOf(target)).toBeNull();
      }

      await fixture.admin.from("cases").update({ operational_status: "new" }).eq("id", worked);
    });

    it("keeps the profile-field surface open to a REVOKED member on their own student case", async () => {
      // Revocation takes the org; it does not take a person's rights over their own file — and
      // it must not take the ordinary profile edit either, or the rule is words only.
      const target = caseId("inactiveStudentA");
      const renamed = `revoked member edited ${fixture.stamp}`;
      const { error } = await actor("dualInactiveA").client
        .from("cases")
        .update({ display_name: renamed })
        .eq("id", target);
      expect(error, `their own case stays editable: ${error?.message}`).toBeNull();
      const { data } = await fixture.admin.from("cases").select("display_name").eq("id", target).single();
      expect(data!.display_name).toBe(renamed);

      // But the consultancy columns are still closed to them, as to any student.
      const { error: status } = await actor("dualInactiveA")
        .client.from("cases")
        .update({ operational_status: "closed" })
        .eq("id", target);
      expect(status?.code).toBe("42501");
    });

    it("refuses org A's admin the consultancy columns on the org B case they are the STUDENT of", async () => {
      // The cross-tenant intersection: an admin elsewhere is still only a student here, and
      // `can_staff_case` / `is_org_admin` are asked about the CASE's org, never the actor's.
      const target = caseId("crossStudentB");
      const dual = actor("crossTenantDual");

      const renamed = `student-edited ${fixture.stamp}`;
      const { error: profile } = await dual.client.from("cases").update({ display_name: renamed }).eq("id", target);
      expect(profile, "their student rights on this one case are real").toBeNull();

      const { error: status } = await dual.client
        .from("cases")
        .update({ operational_status: "closed" })
        .eq("id", target);
      expect(status?.code, "admin standing in org A must not reach org B's operating record").toBe("42501");

      const { error: archive } = await dual.client
        .from("cases")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", target);
      expect(archive?.code, "admin standing in org A must not archive an org B case").toBe("42501");
      expect(await archivedOf(target)).toBeNull();
    });
  });

  // ===================================================================================
  // Two places where the layers deliberately answer at DIFFERENT GRANULARITIES. Neither is a
  // security hole — in both, TypeScript is the narrower of the two, which the canonical matrix
  // calls the safe direction — but both are pinned here so they cannot drift silently. If a
  // future change closes either gap, these tests fail and force the decision to be conscious.
  describe("known layer asymmetries, pinned", () => {
    it("TypeScript authorizes `case.update` as a whole verb while the database splits it by column", async () => {
      // `lib/cases/README.md` §"Known gap: student permitted fields": the TS matrix has no
      // field-level dimension, so it allows the linked student `case.update` and leaves
      // "permitted fields only" to the caller. The database does NOT — the write-surface
      // trigger refuses `operational_status` and `archived_at` outright.
      //
      // Consequence a Stage 3 route must respect: `requireCasePermission(actor, case,
      // "case.update")` is NOT sufficient authorization to apply an arbitrary case patch on a
      // student's behalf. Today the database is what stops it.
      const { decision } = await checkCasePermission(
        actor("studentA").id,
        caseId("orgAssignedA"),
        "case.update",
        fixture.admin,
      );
      expect(decision.allowed, "TS allows the verb at case granularity").toBe(true);

      const { error } = await actor("studentA")
        .client.from("cases")
        .update({ operational_status: "closed" })
        .eq("id", caseId("orgAssignedA"));
      expect(error?.code, "the database refuses the same actor at column granularity").toBe("42501");
    });

    it("TypeScript denies a student `case.list` while the database still returns their own cases", async () => {
      // `case.list` is an ORG-scoped question — "may this actor enumerate this organization's
      // caseload?" — and a student holds no membership, so TS answers no. The database has no
      // separate list verb: a student's `select * from cases` returns the rows they already
      // hold `case.read` on. Narrower in TS, and no row crosses a boundary either way.
      const { decision } = await checkOrgPermission(actor("studentA").id, fixture.orgA, "case.list", fixture.admin);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("no-relationship");

      const visible = await probes.visibleCaseIds(actor("studentA"));
      expect(visible, "exactly their own two cases — nothing of the organization's").toEqual(
        [caseId("orgAssignedA"), caseId("personalA")].sort(),
      );
    });
  });

  // ===================================================================================
  describe("role forgery: authorization is read from membership rows, never from a token", () => {
    it("carries the forged claims in the actual JWT — so the denial below is not vacuous", () => {
      const [, payload] = actor("forger").accessToken.split(".");
      const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as {
        app_metadata?: Record<string, unknown>;
        user_metadata?: Record<string, unknown>;
      };
      // If GoTrue ever stopped propagating these, every forgery assertion would pass for the
      // wrong reason. Assert the attack is actually being mounted.
      expect(claims.app_metadata?.role, "the forged app_metadata claim must reach the JWT").toBe("owner");
      expect(claims.user_metadata?.role, "the forged user_metadata claim must reach the JWT").toBe("owner");
    });

    it("grants a metadata-forged 'owner' of org A exactly nothing", async () => {
      const forger = actor("forger");

      expect(await probes.visibleCaseIds(forger)).toEqual([]);
      for (const table of TENANCY_TABLES) {
        const { data, error } = await forger.client.from(table).select("id");
        expect(error, `${table} read must filter, not error`).toBeNull();
        expect(data ?? [], `forged metadata must not open ${table}`).toEqual([]);
      }

      // The organization exists and its real owner sees it — denied, not absent.
      const { data: realOwnerSees } = await actor("ownerA").client.from("organizations").select("id");
      expect((realOwnerSees ?? []).map((r) => r.id)).toEqual([fixture.orgA]);
    });

    it("rejects a JWT whose subject was swapped for another user's", async () => {
      // The trust root under everything above: `auth.uid()` is only meaningful because the
      // token is signed. Take a real session, repoint `sub` at org A's owner, keep the
      // original signature — a valid-looking token that must not authenticate.
      const forged = tamperJwtSubject(actor("outsider").accessToken, actor("ownerA").id);
      const client = createClient(url!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${forged}` } },
      });
      const { data, error } = await client.from("cases").select("id");
      expect(error, "a tampered JWT must be rejected outright, not merely filtered").not.toBeNull();
      expect(data ?? []).toEqual([]);
    });
  });

  // ===================================================================================
  // Ordered last on purpose: it revokes a membership and leaves it revoked.
  describe("revocation takes effect on the very next query, with no session refresh", () => {
    it("drops an active, assigned counsellor to zero access the moment their row flips", async () => {
      const revocable = actor("revocableA");
      // Same signed-in client throughout — the JWT is never refreshed, so anything that
      // survived would prove access is a token property rather than a row property.
      expect(await probes.visibleCaseIds(revocable)).toEqual([caseId("revocableWorkA")]);
      const before = await checkCasePermission(revocable.id, caseId("revocableWorkA"), "case.read", fixture.admin);
      expect(before.decision.allowed, "the positive half — without it the loss below proves nothing").toBe(true);

      const { error } = await fixture.admin
        .from("organization_memberships")
        .update({ status: "inactive" })
        .eq("organization_id", fixture.orgA)
        .eq("user_id", revocable.id);
      expect(error).toBeNull();

      // Database layer: gone.
      expect(await probes.visibleCaseIds(revocable)).toEqual([]);
      const { data: orgs } = await revocable.client.from("organizations").select("id");
      expect(orgs ?? []).toEqual([]);
      const { data: assignments } = await revocable.client.from("case_assignments").select("case_id");
      expect(assignments ?? []).toEqual([]);
      // Denied, not deleted: the assignment row survives as history.
      const { data: assignmentProof } = await fixture.admin
        .from("case_assignments")
        .select("case_id")
        .eq("user_id", revocable.id);
      expect((assignmentProof ?? []).length).toBe(1);

      // TypeScript layer: gone, for the same reason and with the reason named.
      const after = await checkCasePermission(revocable.id, caseId("revocableWorkA"), "case.read", fixture.admin);
      expect(after.decision.allowed).toBe(false);
      expect(after.decision.reason).toBe("membership-inactive");
    });

    it("stops a revoked member re-activating or promoting themselves", async () => {
      const revocable = actor("revocableA");
      // They can still SEE their own membership row — it is theirs, and the audit trail needs
      // it to survive. Seeing it is not writing it.
      const { data: ownRow } = await revocable.client
        .from("organization_memberships")
        .select("user_id, status")
        .eq("user_id", revocable.id);
      expect((ownRow ?? []).map((r) => r.user_id)).toEqual([revocable.id]);

      await revocable.client
        .from("organization_memberships")
        .update({ status: "active" })
        .eq("user_id", revocable.id);
      await revocable.client.from("organization_memberships").update({ role: "owner" }).eq("user_id", revocable.id);
      await revocable.client.from("organization_memberships").delete().eq("user_id", revocable.id);

      const { data } = await fixture.admin
        .from("organization_memberships")
        .select("status, role")
        .eq("organization_id", fixture.orgA)
        .eq("user_id", revocable.id)
        .single();
      expect(data, "the row is the assertion: untouched, still inactive, still a counsellor").toEqual({
        status: "inactive",
        role: "counsellor",
      });
    });
  });
});
