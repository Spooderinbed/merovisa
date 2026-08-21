import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

/**
 * MV-172 — spec **F-8**, closed on all SEVEN routes.
 *
 * ## Why seven and not five
 *
 * F-8 names five. That count is right for what F-8 measured — routes invisible to
 * §6.2's service-role lens, because they already ran on the authenticated client.
 * It is not the count of routes that need a case id. `app/api/plan/action` and
 * `app/api/profile/section` do exactly the same thing and were simply visible to
 * the registry, so §6.2 gave them a CLIENT disposition and said nothing about
 * their case id. Parameterize F-8's five alone and the case route ships with the
 * plan and the profile editor still writing to the COUNSELLOR's own case. The
 * spec is amended to seven in this slice's PR.
 *
 * ## The property, and why a 200 is not evidence of it
 *
 * RLS cannot catch a wrong-case write here: the counsellor legitimately may reach
 * their own case, so the row is admitted and the request succeeds — against the
 * wrong student. There is no status to assert on. What can be asserted at this
 * layer is the ARGUMENT: the case id the route hands its repository, and the case
 * id it hands the permission layer. Both are read below, per route.
 *
 * The read-back proof — the row itself, on a real database, under a real
 * `authenticated` JWT — is `tests/integration/stage3-case-route.itest.ts`. These
 * two suites are complements, not duplicates: this one proves the routes plumb the
 * id, that one proves Postgres accepts the resulting row on a student-less case
 * and refuses it across the boundary.
 */

const {
  getUser,
  upsertProgramState,
  deleteProgramState,
  captureApplication,
  setObtained,
  freezePredictionForProgram,
  getPredictionById,
  insertAttempt,
  getAttemptById,
  insertEvent,
  listEventTypesForAttempt,
  getPlanItemKind,
  setPlanItemStatus,
  setPlanItemStarted,
  patchProfileSectionForCase,
  invalidatePlan,
  reScoreAssessment,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsertProgramState: vi.fn(),
  deleteProgramState: vi.fn(),
  captureApplication: vi.fn(),
  setObtained: vi.fn(),
  freezePredictionForProgram: vi.fn(),
  getPredictionById: vi.fn(),
  insertAttempt: vi.fn(),
  getAttemptById: vi.fn(),
  insertEvent: vi.fn(),
  listEventTypesForAttempt: vi.fn(),
  getPlanItemKind: vi.fn(),
  setPlanItemStatus: vi.fn(),
  setPlanItemStarted: vi.fn(),
  patchProfileSectionForCase: vi.fn(),
  invalidatePlan: vi.fn(),
  reScoreAssessment: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, tag: "authenticated" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/matches/repo", () => ({ upsertProgramState, deleteProgramState }));
vi.mock("@/lib/outcomes/on-apply", () => ({ captureApplication }));
vi.mock("@/lib/documents/status-repo", () => ({ setObtained }));
vi.mock("@/lib/outcomes/freeze", () => ({ freezePredictionForProgram }));
vi.mock("@/lib/outcomes/repo", () => ({
  getPredictionById,
  insertAttempt,
  getAttemptById,
  insertEvent,
  listEventTypesForAttempt,
}));
vi.mock("@/lib/plan/repo", () => ({ getPlanItemKind, setPlanItemStatus, setPlanItemStarted }));
vi.mock("@/lib/profiles/repo", () => ({ patchProfileSectionForCase }));
vi.mock("@/lib/plan/invalidate", () => ({ invalidatePlan }));
vi.mock("@/lib/assessments/re-score", () => ({ reScoreAssessment }));

const { resolvePersonalCaseId, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

import { POST as shortlistPost } from "@/app/api/shortlist/route";
import { POST as documentStatusPost } from "@/app/api/documents/status/route";
import { POST as predictionPost } from "@/app/api/outcomes/prediction/route";
import { POST as attemptPost } from "@/app/api/outcomes/attempt/route";
import { POST as eventPost } from "@/app/api/outcomes/event/route";
import { POST as planActionPost } from "@/app/api/plan/action/route";
import { PATCH as profileSectionPatch } from "@/app/api/profile/section/route";

const ACTOR = "actor-user-id";
/** The counsellor's OWN case — what a route that ignores the parameter writes to. */
const PERSONAL = "11111111-1111-4111-8111-111111111111";
/** The student's case, named in the request. */
const REQUESTED = "22222222-2222-4222-a222-222222222222";
const ATTEMPT = "33333333-3333-4333-a333-333333333333";
const PREDICTION = "44444444-4444-4444-a444-444444444444";

const json = (url: string, method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * The seven. `caseIdOf` reads the case id back out of whichever repository call
 * the route makes — that is the argument a mis-parameterized route gets wrong,
 * and the only thing at this layer that distinguishes a route honouring the
 * parameter from one resolving the actor's own case.
 */
const ROUTES: ReadonlyArray<{
  name: string;
  file: string;
  namedBy: "F-8" | "MV-172";
  call: (body: Record<string, unknown>) => Promise<Response>;
  caseIdOf: () => unknown;
  /** Reset to a shape where the route reaches its write. */
  arrange: () => void;
  body: Record<string, unknown>;
}> = [
  {
    name: "POST /api/shortlist",
    file: "app/api/shortlist/route.ts",
    namedBy: "F-8",
    body: { programId: "p1", status: "shortlisted" },
    call: (body) => shortlistPost(json("http://localhost/api/shortlist", "POST", body)),
    arrange: () => upsertProgramState.mockResolvedValue(true),
    caseIdOf: () => upsertProgramState.mock.calls[0]?.[1]?.caseId,
  },
  {
    name: "POST /api/documents/status",
    file: "app/api/documents/status/route.ts",
    namedBy: "F-8",
    body: { kind: "passport", obtained: true },
    call: (body) => documentStatusPost(json("http://localhost/api/documents/status", "POST", body)),
    arrange: () => setObtained.mockResolvedValue(true),
    caseIdOf: () => setObtained.mock.calls[0]?.[1],
  },
  {
    name: "POST /api/outcomes/prediction",
    file: "app/api/outcomes/prediction/route.ts",
    namedBy: "F-8",
    body: { programId: "p1" },
    call: (body) => predictionPost(json("http://localhost/api/outcomes/prediction", "POST", body)),
    arrange: () =>
      freezePredictionForProgram.mockResolvedValue({ ok: true, prediction: { id: PREDICTION }, created: true }),
    caseIdOf: () => freezePredictionForProgram.mock.calls[0]?.[1],
  },
  {
    name: "POST /api/outcomes/attempt",
    file: "app/api/outcomes/attempt/route.ts",
    namedBy: "F-8",
    body: { predictionId: PREDICTION },
    call: (body) => attemptPost(json("http://localhost/api/outcomes/attempt", "POST", body)),
    arrange: () => {
      getPredictionById.mockResolvedValue({ id: PREDICTION, programId: "p1" });
      insertAttempt.mockResolvedValue({ id: ATTEMPT });
    },
    caseIdOf: () => insertAttempt.mock.calls[0]?.[1]?.caseId,
  },
  {
    name: "POST /api/outcomes/event",
    file: "app/api/outcomes/event/route.ts",
    namedBy: "F-8",
    body: { attemptId: ATTEMPT, eventType: "offer_received", occurredAt: "2026-08-11T00:00:00.000Z" },
    call: (body) => eventPost(json("http://localhost/api/outcomes/event", "POST", body)),
    arrange: () => {
      getAttemptById.mockResolvedValue({ id: ATTEMPT });
      listEventTypesForAttempt.mockResolvedValue(["applied"]);
      insertEvent.mockResolvedValue({ id: "evt-1" });
    },
    caseIdOf: () => insertEvent.mock.calls[0]?.[1]?.caseId,
  },
  {
    name: "POST /api/plan/action",
    file: "app/api/plan/action/route.ts",
    namedBy: "MV-172",
    body: { id: 1, status: "done" },
    call: (body) => planActionPost(json("http://localhost/api/plan/action", "POST", body)),
    arrange: () => {
      getPlanItemKind.mockResolvedValue("k");
      setPlanItemStatus.mockResolvedValue(true);
    },
    caseIdOf: () => setPlanItemStatus.mock.calls[0]?.[1],
  },
  {
    name: "PATCH /api/profile/section",
    file: "app/api/profile/section/route.ts",
    namedBy: "MV-172",
    body: { section: "personal", patch: { name: "Asha" } },
    call: (body) => profileSectionPatch(json("http://localhost/api/profile/section", "PATCH", body)),
    arrange: () => patchProfileSectionForCase.mockResolvedValue({ completeness: 12, sections: {} }),
    caseIdOf: () => patchProfileSectionForCase.mock.calls[0]?.[1],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  resolvePersonalCaseId.mockResolvedValue(PERSONAL);
  checkCasePermission.mockResolvedValue({
    decision: { allowed: true, requiredScope: "assigned", reason: null },
    context: {},
  });
});

// MV-190 closed F-8 for three MORE routes — the `documents` upload, delete and view.
// They are not in `ROUTES` because they take no JSON body (multipart, DELETE, GET), so
// the table's `call({ ...body, caseId })` shape cannot express them; the sweep below
// still holds them to being parameterized, and `tests/api/documents/named-case.test.ts`
// holds them to the same three properties this table checks.
describe("F-8 — the seven case-scoped write routes take an EXPLICIT case id", () => {
  /**
   * DERIVED FROM THE TREE, not from the array. The count "seven" is the finding
   * this slice adds to the spec, and a hand-written list of seven names asserting
   * it holds seven names would be exactly the vacuous completeness check
   * `case-denial.test.ts` had to replace. So the filesystem is swept for routes
   * that still call `resolvePersonalCaseId`, and every one of them must either
   * appear here or be a route this slice deliberately left alone.
   */
  it("covers every write route that resolves a case, derived from app/api", () => {
    /**
     * Reads that resolve the actor's own case and take no case id. Recorded rather
     * than fixed:
     *
     * - `outcomes` GET renders the actor's outcome history. In the case route it
     *   would show the COUNSELLOR's — a "whose case am I looking at" defect, which
     *   is MV-173's kind, not a write-safety one. Spec F-8's note carries it.
     * - `guide/chat` is not in this slice's rendered surface.
     * - `assess/refresh` is a permanent service-role path whose case stays the
     *   actor's own.
     *
     * THE THREE `documents` ROUTES LEFT THIS SET IN MV-190. They no longer resolve
     * the actor's own case at all, so listing them here would be a stale exemption
     * that hides a regression: with them removed, a future edit that reaches for
     * `resolvePersonalCaseId` inside one of them fails this test rather than quietly
     * shipping a counsellor writing to their own vault.
     */
    const OUT_OF_SCOPE = new Set([
      "app/api/outcomes/route.ts",
      "app/api/guide/chat/route.ts",
      "app/api/assess/refresh/route.ts",
    ]);

    /**
     * MV-190 — parameterized, but NOT through a JSON body, so they cannot have a
     * `ROUTES` row (every row calls `call({ ...body, caseId })`).
     *
     * `upload` is multipart and reads a form field; `[id]` and `[id]/view` are DELETE
     * and GET, which carry no body at all, and read `?caseId=`. The property they owe
     * is identical and is proven in their own suite — `tests/api/documents/named-case.test.ts`
     * asserts each authorizes the REQUESTED case, refuses one it cannot reach, and
     * never falls back to the actor's own.
     *
     * Enumerated rather than pattern-matched so the exemption stays a decision. The
     * assertions below pin it from both sides: each of these must really be
     * parameterized, and nothing else may claim the exemption.
     */
    const NON_BODY_CASE_ROUTES = new Set([
      "app/api/documents/upload/route.ts",
      "app/api/documents/[id]/route.ts",
      "app/api/documents/[id]/view/route.ts",
    ]);

    const files = apiRouteFiles(path.join(process.cwd(), "app", "api"));
    const calls = (pattern: RegExp) =>
      files.filter((file) =>
        pattern.test(stripComments(readFileSync(path.join(process.cwd(), file), "utf8"))),
      );

    const parameterized = calls(/\bresolveTargetCase\s*\(/);
    const actorsOwn = calls(/\bresolvePersonalCaseId\s*\(/);
    // A bad sweep returning zero would make both checks below pass vacuously.
    expect(parameterized.length).toBeGreaterThan(5);
    // Was `> 3` until MV-190 moved the three `documents` routes off `resolvePersonalCaseId`,
    // leaving `outcomes`, `guide/chat` and `assess/refresh`. It is a VACUITY guard — a broken
    // sweep returning zero would make the emptiness check below pass for the wrong reason — so it
    // tracks the real remaining count rather than being loosened to nothing.
    expect(actorsOwn.length).toBeGreaterThan(2);

    // Every non-body exemption must REALLY be a parameterized route. Without this the
    // set could name a file that never took a case id and the exemption would be a
    // hiding place rather than a decision.
    expect([...NON_BODY_CASE_ROUTES].sort()).toEqual(
      parameterized.filter((file) => NON_BODY_CASE_ROUTES.has(file)).sort(),
    );

    // Every parameterized route has a row, and every row is a parameterized route —
    // apart from the enumerated non-body three, which carry the same property in
    // their own suite because this table's shape cannot express them.
    expect(parameterized.filter((file) => !NON_BODY_CASE_ROUTES.has(file)).sort()).toEqual(
      [...ROUTES.map((r) => r.file)].sort(),
    );

    // AND nothing in scope still resolves the actor's own case behind the app's
    // back. This is the half that would catch an eighth route: a write surface
    // added later that reaches for `resolvePersonalCaseId` fails here rather than
    // shipping a case route that writes to the counsellor.
    expect(
      actorsOwn.filter((file) => !OUT_OF_SCOPE.has(file)),
      "this route resolves the ACTOR's own case and is not recorded as out of scope",
    ).toEqual([]);

    expect(ROUTES).toHaveLength(7);
    expect(ROUTES.filter((r) => r.namedBy === "MV-172").map((r) => r.file)).toEqual([
      "app/api/plan/action/route.ts",
      "app/api/profile/section/route.ts",
    ]);
  });

  describe.each(ROUTES)("$name", ({ call, body, arrange, caseIdOf }) => {
    it("writes to the REQUESTED case, and never consults the actor's own", async () => {
      arrange();

      const res = await call({ ...body, caseId: REQUESTED });

      expect(res.status).toBeLessThan(400);
      // The argument, not the status. A route that ignored the parameter returns
      // exactly the same 200 while writing to PERSONAL.
      expect(caseIdOf(), "the write landed on the wrong case").toBe(REQUESTED);
      expect(checkCasePermission).toHaveBeenCalledWith(
        ACTOR,
        REQUESTED,
        "case.update",
        expect.anything(),
      );
      // No fallback. If the personal case is resolved at all, a mishandled id has
      // somewhere to land quietly — which is F-8's failure mode 1 exactly.
      expect(resolvePersonalCaseId).not.toHaveBeenCalled();
    });

    it("still resolves the actor's own case when the body names none", async () => {
      arrange();

      const res = await call(body);

      expect(res.status).toBeLessThan(400);
      expect(caseIdOf()).toBe(PERSONAL);
      expect(resolvePersonalCaseId).toHaveBeenCalledWith(ACTOR, expect.anything());
    });

    it("refuses a REQUESTED case the actor may not reach, and writes nothing", async () => {
      arrange();
      checkCasePermission.mockResolvedValue({
        decision: { allowed: false, requiredScope: null, reason: "not-assigned" },
        context: {},
      });

      const res = await call({ ...body, caseId: REQUESTED });

      expect(res.status).toBe(403);
      expect(caseIdOf(), "a denied request still wrote a row").toBeUndefined();
      // Not substituted for the actor's own case either — a denial is a denial,
      // not a redirect to somewhere the actor IS allowed to write.
      expect(resolvePersonalCaseId).not.toHaveBeenCalled();
    });

    it("400s a malformed case id rather than falling back to the actor's own", async () => {
      arrange();

      const res = await call({ ...body, caseId: "case-the-client-asked-for" });

      expect(res.status).toBe(400);
      expect(caseIdOf()).toBeUndefined();
      expect(checkCasePermission).not.toHaveBeenCalled();
      expect(resolvePersonalCaseId).not.toHaveBeenCalled();
    });
  });
});

/** Every `app/api/**\/route.ts`, as repo-relative forward-slash paths. */
function apiRouteFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      apiRouteFiles(absolute, found);
    } else if (entry === "route.ts" || entry === "route.tsx") {
      found.push(path.relative(process.cwd(), absolute).split(path.sep).join("/"));
    }
  }
  return found;
}

/**
 * Comments out, so a doc comment merely NAMING the resolver is not read as a call
 * site. Split on /\r?\n/ — on a CRLF checkout a bare "\n" split matches nothing
 * and the filter would silently pass every line through.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join("\n");
}
