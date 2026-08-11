/**
 * MV-172 — Stage 3 slice 5: the case route's writes, proven against a real database.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the default
 * `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts). Skips cleanly when the env vars are absent. LOCAL STACK ONLY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHAT IT CANNOT
 * ---------------------------------------------------------------------------------------
 * `tests/api/case-scoped-routes.test.ts` proves the seven routes PLUMB an explicit case id.
 * That is an argument-level proof against mocked repositories. It cannot show that Postgres
 * accepts the resulting row on a case whose student does not exist, that the row carries
 * `owner IS NULL`, or that a cross-case attempt is actually refused. This file runs the same
 * route handlers against the live schema, as a real `authenticated` JWT, and reads the rows
 * back service-role.
 *
 * **THE VACUITY TRAP THIS FIXTURE EXISTS FOR (spec §9.2, row E7).** If the counsellor under
 * test has no personal case of their own, a mis-scoped write has nowhere to land — it errors
 * instead of landing somewhere wrong — and a route that ignores the case id is
 * INDISTINGUISHABLE from one that honours it. So `counsellorAssignedA` is given a personal
 * case here, seeded with a `document_status` row and a `user_program_state` row on the SAME
 * tables and the SAME keys the tests write. Every positive then asserts twice: the row landed
 * on the student's case, AND the counsellor's own pre-existing row is untouched.
 *
 * **Never "did not throw", never a boolean.** `setObtained` and `upsertProgramState` return
 * `false` on refusal and the routes turn that into a status, so the assertion is always the
 * ROW, read back by `(case_id, kind)` / `(case_id, program_id)`.
 *
 * **Honest scope.** The three `outcomes` routes are covered here by their REFUSAL only. Their
 * positive path needs a frozen prediction, which needs the catalogue readable through
 * PostgREST — and it is not, on this stack (`stage3-write-grants.itest.ts` reads `programs`
 * through `psql` for the same reason). Their case-id plumbing is proven in the unit matrix and
 * their grants in `stage3-write-grants.itest.ts`; what is NOT proven anywhere is their
 * end-to-end write on a student-less case, and that is stated rather than papered over.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  assertLocalStack,
  jwtRoleClaim,
  seedTenancyFixture,
  type Actor,
  type TenancyFixture,
} from "./fixtures/tenancy";

/**
 * The route handlers build their clients through these two factories, so the suite
 * substitutes them: the AUTHENTICATED one becomes the actor's real JWT-bearing client, and
 * the admin one becomes the fixture's service-role client (`profile/section` keeps three
 * refused legs on it — spec §6.2 entry 9).
 */
const holder: { actor: Actor | null; admin: SupabaseClient<Database> | null } = {
  actor: null,
  admin: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => routeClient(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => holder.admin,
}));

/**
 * The actor's real client, with `auth.getUser()` answering from the fixture rather than over
 * the network. Everything else — `.from()` above all — passes through untouched, so every
 * query in this file is evaluated by RLS as that user.
 */
function routeClient(): SupabaseClient<Database> {
  const actor = holder.actor;
  if (!actor) throw new Error("HARNESS DEFECT: no actor selected for this request");
  return new Proxy(actor.client, {
    get(target, prop, receiver) {
      if (prop === "auth") {
        return { getUser: async () => ({ data: { user: { id: actor.id } }, error: null }) };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }) as SupabaseClient<Database>;
}

import { POST as documentStatusPost } from "@/app/api/documents/status/route";
import { POST as shortlistPost } from "@/app/api/shortlist/route";
import { POST as planActionPost } from "@/app/api/plan/action/route";
import { PATCH as profileSectionPatch } from "@/app/api/profile/section/route";
import { POST as predictionPost } from "@/app/api/outcomes/prediction/route";
import { POST as attemptPost } from "@/app/api/outcomes/attempt/route";
import { POST as eventPost } from "@/app/api/outcomes/event/route";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("stage3-case-route.itest.ts", url);

const json = (path: string, method: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe.skipIf(!url || !serviceKey || !anonKey)("MV-172 the case route writes to THE CASE", () => {
  let fixture: TenancyFixture;
  /** Organization A, `student_user_id IS NULL`, `counsellorAssignedA` is its primary counsellor. */
  let studentCase: string;
  /** Organization B's case. `counsellorAssignedA` holds no membership there at all. */
  let unreachableCase: string;
  /** THE E7 FIXTURE: the counsellor's OWN case, where a mis-scoped write would land. */
  let counsellorOwnCase: string;
  let programId: string;
  let otherProgramId: string;
  let planItemId: number;
  let assessmentId: string;
  const planKind = `mv172-plan-${Date.now()}`;

  /** The counsellor's own pre-existing rows, so "untouched" is a real assertion. */
  const OWN_KIND = "passport";
  const TARGET_KIND = "ielts";

  beforeAll(async () => {
    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    holder.admin = fixture.admin;
    studentCase = fixture.cases.unclaimedA;
    unreachableCase = fixture.cases.orgAssignedB;

    const counsellor = fixture.actors.counsellorAssignedA;

    // E1's guard, asserted rather than assumed: a probe issued as `service_role` bypasses
    // every policy and proves nothing at all.
    expect(
      jwtRoleClaim(counsellor.accessToken),
      "the actor's JWT is not `authenticated` — every assertion below would be vacuous",
    ).toBe("authenticated");

    // E4's guard: a case WITH a student never exercises the consultancy row shape.
    const { data: caseRow } = await fixture.admin
      .from("cases")
      .select("student_user_id, organization_id")
      .eq("id", studentCase)
      .single();
    expect(
      (caseRow as { student_user_id: string | null }).student_user_id,
      "HARNESS DEFECT: the case under test has a student, so `owner IS NULL` is never exercised",
    ).toBeNull();

    const { data: programs } = await fixture.admin.from("programs").select("id").limit(2);
    const ids = ((programs ?? []) as Array<{ id: string }>).map((p) => p.id);
    programId = ids[0] ?? "";
    otherProgramId = ids[1] ?? ids[0] ?? "";
    expect(programId, "HARNESS DEFECT: no programs seeded by the migrations").toBeTruthy();

    // ---- THE E7 FIXTURE ----------------------------------------------------------------
    // The counsellor's own personal case, carrying a row on each table the tests write. A
    // wrong-case write then has somewhere to land, and lands VISIBLY.
    const { data: own, error: ownError } = await fixture.admin
      .from("cases")
      .insert({
        display_name: "MV-172 counsellor's own case",
        student_user_id: counsellor.id,
        organization_id: null,
      } as never)
      .select("id")
      .single();
    expect(ownError, `HARNESS DEFECT: could not seed the counsellor's personal case: ${ownError?.message}`).toBeNull();
    counsellorOwnCase = (own as { id: string }).id;

    await fixture.admin.from("document_status").insert({
      case_id: counsellorOwnCase,
      owner: counsellor.id,
      kind: OWN_KIND,
      obtained: false,
    } as never);
    await fixture.admin.from("user_program_state").insert({
      case_id: counsellorOwnCase,
      owner: counsellor.id,
      program_id: programId,
      status: "shortlisted",
    } as never);

    // The plan item the plan/action route will move, on the STUDENT's case.
    const { data: item } = await fixture.admin
      .from("plan_items")
      .insert({
        owner: null,
        case_id: studentCase,
        kind: planKind,
        impact: "high",
        title: "MV-172 step",
        body: "seeded",
        status: "todo",
      } as never)
      .select("id")
      .single();
    planItemId = Number((item as { id: number }).id);

    // The primary assessment the profile edit must be seen to move. `result` starts as a
    // marker no re-score would ever produce, so "the verdict changed" cannot pass by accident.
    const { data: assessment } = await fixture.admin
      .from("assessments")
      .insert({
        owner: null,
        case_id: studentCase,
        result: { marker: "never-rescored" },
        rule_version: "mv172-fixture",
        destination_id: "AU",
        is_primary: true,
        profile_snapshot: {},
        expires_at: "9999-12-31T00:00:00.000Z",
      } as never)
      .select("id")
      .single();
    assessmentId = (assessment as { id: string }).id;

    holder.actor = counsellor;
  }, 180_000);

  afterAll(async () => {
    if (!fixture) return;
    for (const caseId of [studentCase, counsellorOwnCase, unreachableCase].filter(Boolean)) {
      await fixture.admin.from("outcome_events").delete().eq("case_id", caseId);
      await fixture.admin.from("application_attempts").delete().eq("case_id", caseId);
      await fixture.admin.from("program_predictions").delete().eq("case_id", caseId);
      await fixture.admin.from("document_status").delete().eq("case_id", caseId);
      await fixture.admin.from("user_program_state").delete().eq("case_id", caseId);
      await fixture.admin.from("plan_items").delete().eq("case_id", caseId);
      await fixture.admin.from("assessments").delete().eq("case_id", caseId);
      await fixture.admin.from("profiles").delete().eq("case_id", caseId);
    }
    // The personal case belongs to no organization, so `fixture.teardown()` does not cascade
    // it — and every child row above had to go first (ON DELETE RESTRICT).
    if (counsellorOwnCase) await fixture.admin.from("cases").delete().eq("id", counsellorOwnCase);
    await fixture.teardown();
  }, 180_000);

  // =====================================================================================
  // The positives. Each asserts the ROW on the student's case AND the counsellor's own row
  // unchanged — the second half is what makes the first one mean something.
  // =====================================================================================

  it("cell 22 — a checklist tick lands on the STUDENT's case, with `owner` NULL", async () => {
    const res = await documentStatusPost(
      json("/api/documents/status", "POST", {
        kind: TARGET_KIND,
        obtained: true,
        caseId: studentCase,
      }),
    );
    expect(res.status, await res.text()).toBe(200);

    const { data: rows, error } = await fixture.admin
      .from("document_status")
      .select("case_id, owner, kind, obtained")
      .eq("case_id", studentCase)
      .eq("kind", TARGET_KIND);
    expect(error).toBeNull();
    const written = (rows ?? []) as Array<{ owner: string | null; obtained: boolean }>;
    // A created-row COUNT, because "every row has owner IS NULL" is trivially true of none.
    expect(written.length, "no document_status row landed on the student's case").toBe(1);
    expect(written[0]!.owner, "a consultancy row carries owner NULL — spec §6.3").toBeNull();
    expect(written[0]!.obtained).toBe(true);

    // AND the counsellor's own checklist is untouched. Without this, a route that ignored the
    // case id would look identical: it would still have written A row, somewhere.
    const { data: ownRows } = await fixture.admin
      .from("document_status")
      .select("kind, obtained")
      .eq("case_id", counsellorOwnCase);
    expect((ownRows ?? []).length, "the write leaked onto the counsellor's own case").toBe(1);
    expect((ownRows as Array<{ kind: string; obtained: boolean }>)[0]!.kind).toBe(OWN_KIND);
    expect((ownRows as Array<{ obtained: boolean }>)[0]!.obtained).toBe(false);
  }, 120_000);

  it("cell 21 — a shortlist choice lands on the STUDENT's case, with `owner` NULL", async () => {
    // Deliberately the OTHER program: the counsellor's own case already holds a row for
    // `programId`, so a wrong-case write would resolve onto it and change its status rather
    // than failing — the quiet form of this bug.
    const res = await shortlistPost(
      json("/api/shortlist", "POST", {
        programId: otherProgramId,
        status: "shortlisted",
        caseId: studentCase,
      }),
    );
    expect(res.status, await res.text()).toBe(200);

    const { data: rows } = await fixture.admin
      .from("user_program_state")
      .select("owner, program_id, status")
      .eq("case_id", studentCase)
      .eq("program_id", otherProgramId);
    const written = (rows ?? []) as Array<{ owner: string | null; status: string }>;
    expect(written.length, "no user_program_state row landed on the student's case").toBe(1);
    expect(written[0]!.owner).toBeNull();
    expect(written[0]!.status).toBe("shortlisted");

    const { data: ownRows } = await fixture.admin
      .from("user_program_state")
      .select("program_id, status")
      .eq("case_id", counsellorOwnCase);
    expect((ownRows ?? []).length, "the write leaked onto the counsellor's own case").toBe(1);
    expect((ownRows as Array<{ program_id: string }>)[0]!.program_id).toBe(programId);
  }, 120_000);

  it("§6.2 entry 8 — a plan action moves the STUDENT's item, on the AUTHENTICATED client", async () => {
    // This route no longer holds a service-role client at all, so this is the only place the
    // grant `UPDATE (status, completed_at, started_at)` is shown to actually carry it.
    const res = await planActionPost(
      json("/api/plan/action", "POST", { id: planItemId, status: "done", caseId: studentCase }),
    );
    expect(res.status, await res.text()).toBe(200);

    const { data: row } = await fixture.admin
      .from("plan_items")
      .select("status, completed_at, case_id")
      .eq("id", planItemId)
      .single();
    const item = row as { status: string; completed_at: string | null; case_id: string };
    expect(item.status, "the plan item did not move — the UPDATE affected zero rows").toBe("done");
    expect(item.completed_at).not.toBeNull();
    expect(item.case_id).toBe(studentCase);
  }, 120_000);

  it("§6.2 entry 9 — a profile edit writes the STUDENT's profile AND still moves their verdict", async () => {
    // THE SILENT-FAILURE REGRESSION. `reScoreAssessment` never destructures `error` and a
    // PostgREST 42501 RESOLVES, so a route that had flipped its re-score leg onto the
    // authenticated client would answer 200 here with the verdict frozen — and only this
    // assertion would notice.
    const res = await profileSectionPatch(
      json("/api/profile/section", "PATCH", {
        section: "personal",
        patch: { name: "MV-172 student" },
        caseId: studentCase,
      }),
    );
    expect(res.status, await res.text()).toBe(200);

    const { data: profiles } = await fixture.admin
      .from("profiles")
      .select("owner, sections")
      .eq("case_id", studentCase);
    const written = (profiles ?? []) as Array<{ owner: string | null; sections: { personal?: { name?: string } } }>;
    expect(written.length, "no profiles row landed on the student's case").toBe(1);
    expect(written[0]!.owner, "a consultancy profile row carries owner NULL").toBeNull();
    expect(written[0]!.sections.personal?.name).toBe("MV-172 student");

    const { data: after } = await fixture.admin
      .from("assessments")
      .select("result")
      .eq("id", assessmentId)
      .single();
    expect(
      (after as { result: { marker?: string } }).result.marker,
      "the profile edit did not re-score the assessment — the re-score leg is failing SILENTLY",
    ).toBeUndefined();

    // And the counsellor's own case gained no profile at all.
    const { data: ownProfiles } = await fixture.admin
      .from("profiles")
      .select("id")
      .eq("case_id", counsellorOwnCase);
    expect((ownProfiles ?? []).length, "the profile write leaked onto the counsellor's own case").toBe(0);
  }, 120_000);

  // =====================================================================================
  // The negative, on every one of the seven. A refusal that writes nothing ANYWHERE — not to
  // the requested case, and not to the counsellor's own as a consolation.
  // =====================================================================================

  describe("a case the counsellor is not assigned to is REFUSED, and nothing is written", () => {
    const CASES: ReadonlyArray<{ name: string; call: (caseId: string) => Promise<Response> }> = [
      {
        name: "POST /api/documents/status",
        call: (caseId) =>
          documentStatusPost(json("/api/documents/status", "POST", { kind: "ielts", obtained: true, caseId })),
      },
      {
        name: "POST /api/shortlist",
        call: (caseId) =>
          shortlistPost(json("/api/shortlist", "POST", { programId, status: "applied", caseId })),
      },
      {
        name: "POST /api/plan/action",
        call: (caseId) =>
          planActionPost(json("/api/plan/action", "POST", { id: planItemId, status: "dismissed", caseId })),
      },
      {
        name: "PATCH /api/profile/section",
        call: (caseId) =>
          profileSectionPatch(
            json("/api/profile/section", "PATCH", { section: "personal", patch: { name: "leaked" }, caseId }),
          ),
      },
      {
        name: "POST /api/outcomes/prediction",
        call: (caseId) => predictionPost(json("/api/outcomes/prediction", "POST", { programId, caseId })),
      },
      {
        name: "POST /api/outcomes/attempt",
        call: (caseId) =>
          attemptPost(
            json("/api/outcomes/attempt", "POST", {
              predictionId: "00000000-0000-4000-8000-000000000000",
              caseId,
            }),
          ),
      },
      {
        name: "POST /api/outcomes/event",
        call: (caseId) =>
          eventPost(
            json("/api/outcomes/event", "POST", {
              attemptId: "00000000-0000-4000-8000-000000000000",
              eventType: "offer_received",
              occurredAt: "2026-08-11T00:00:00.000Z",
              caseId,
            }),
          ),
      },
    ];

    it.each(CASES)("$name", async ({ call }) => {
      // Everything on the unreachable case, before and after. A refusal that wrote a row is
      // the whole failure this slice exists to prevent, so it is counted rather than assumed.
      const countRows = async (caseId: string) => {
        const tables = [
          "document_status",
          "user_program_state",
          "plan_items",
          "profiles",
          "program_predictions",
          "application_attempts",
          "outcome_events",
        ] as const;
        const counts: Record<string, number> = {};
        for (const table of tables) {
          const { data } = await fixture.admin.from(table).select("case_id").eq("case_id", caseId);
          counts[table] = (data ?? []).length;
        }
        return counts;
      };

      const beforeUnreachable = await countRows(unreachableCase);
      const beforeOwn = await countRows(counsellorOwnCase);

      const res = await call(unreachableCase);

      // `caseDenialResponse`'s mapping: not-yours is 403, and `getCaseContext` refuses to
      // distinguish "no such case" from "not yours", so 404 is equally correct here. What it
      // must never be is 2xx.
      expect([403, 404], `answered ${res.status}`).toContain(res.status);
      expect(await countRows(unreachableCase)).toEqual(beforeUnreachable);
      // AND not silently redirected onto a case the counsellor IS allowed to write.
      expect(await countRows(counsellorOwnCase)).toEqual(beforeOwn);
    }, 120_000);
  });

  it("a MALFORMED case id is refused before any query, and writes nothing", async () => {
    const res = await documentStatusPost(
      json("/api/documents/status", "POST", {
        kind: "police-clearance",
        obtained: true,
        caseId: "case-the-client-asked-for",
      }),
    );
    expect(res.status).toBe(400);

    const { data } = await fixture.admin
      .from("document_status")
      .select("kind")
      .eq("case_id", counsellorOwnCase);
    // The fallback that must not exist: a malformed id resolving to the actor's own case.
    expect((data ?? []).length).toBe(1);
  }, 120_000);
});
