import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * MV-157 §D's denial half — the twelve Server Components, and what each one does
 * when `case.read` is refused or the actor has no personal case.
 *
 * The companion to `tests/api/case-denial.test.ts`, and it exists for the same
 * reason: `git grep 'allowed: false' -- tests` returned nothing, so the
 * `!decision.allowed` branch in every page and the `caseId === null` branch in
 * every page were both unexecuted. Four of these twelve have no suite of their
 * own at all (`/checklist`, `/checklist/all`, `/documents`, and the layout's
 * degrade path), so there was nowhere for a per-suite case to be added.
 *
 * ## The three shapes, written down because they are NOT uniform
 *
 *  - REDIRECT (9 pages) — the page is the student's own data; if the case is not
 *    theirs, send them back through auth. `redirect()` throws in Next, and it is
 *    mocked to throw here for the same reason: a `redirect` that merely records
 *    the call would let execution fall through into the reads, and the "zero
 *    queries" assertion below would pass while the page leaked the rows.
 *  - NOT-FOUND (1 page) — `/assessment/[id]`, where a 404 rather than a redirect
 *    is what stops the id being an oracle for "this assessment exists".
 *  - DEGRADE (2) — `(app)/layout.tsx` drops the journey marker and
 *    `(focused)/assess/page.tsx` drops the prior-assessment fork. Neither may
 *    redirect: the chrome must never be the thing that decides a student cannot
 *    see their own app, and the wizard must stay reachable. What they owe instead
 *    is that they issue no case-scoped read — asserted directly.
 *
 * Server Components are called as plain async functions here. That returns the
 * element tree WITHOUT invoking any child component, which is exactly the scope
 * this file wants: it is about the data-access decisions the page makes before it
 * renders anything, not about markup.
 */

class NextRedirect extends Error {
  readonly target: string;
  constructor(target: string) {
    super(`NEXT_REDIRECT:${target}`);
    this.target = target;
  }
}
class NextNotFound extends Error {}

const { getUser, from, redirect, notFound } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/headers", () => ({ headers: async () => new Map<string, string>() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, from }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from }) }));

const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  ensurePersonalCase: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

// The catalogue is not case-scoped; served from fixtures so its reads never show
// up as "the page queried the database".
vi.mock("@/lib/programs/repo", async () => {
  const { TEST_PROGRAMS, TEST_UNIVERSITIES } = await import("../fixtures/catalog");
  return {
    listAllPrograms: vi.fn().mockResolvedValue(TEST_PROGRAMS),
    listAllUniversities: vi.fn().mockResolvedValue(TEST_UNIVERSITIES),
    getProgram: vi.fn().mockResolvedValue(TEST_PROGRAMS[0]),
    listProgramsForField: vi.fn().mockResolvedValue(TEST_PROGRAMS),
  };
});

// The two DEGRADE pages are asserted on the case-scoped read they must not make.
const { getJourneySignals, getPrimaryAssessmentForCase, getAssessmentById, getRecoverableAssessment } =
  vi.hoisted(() => ({
    getJourneySignals: vi.fn(),
    getPrimaryAssessmentForCase: vi.fn(),
    getAssessmentById: vi.fn(),
    getRecoverableAssessment: vi.fn(),
  }));
vi.mock("@/lib/journey/signals", () => ({ getJourneySignals }));
vi.mock("@/lib/assessments/repo", () => ({
  getPrimaryAssessmentForCase,
  getAssessmentById,
  getRecoverableAssessment,
  listAssessmentsForCase: vi.fn().mockResolvedValue([]),
}));

// MV-180 moved the journey-marker chrome down into the (student) shell; the
// neutral (app) layout no longer reads a case at all.
import StudentLayout from "@/app/(app)/(student)/layout";
import ChecklistLandingPage from "@/app/(app)/(student)/checklist/page";
import GlobalChecklistPage from "@/app/(app)/(student)/checklist/all/page";
import ProgramChecklistPage from "@/app/(app)/(student)/checklist/[programId]/page";
import DashboardPage from "@/app/(app)/(student)/dashboard/page";
import DocumentsPage from "@/app/(app)/(student)/documents/page";
import GuidePage from "@/app/(app)/(student)/guide/page";
import MatchesPage from "@/app/(app)/(student)/matches/page";
import PlanPage from "@/app/(app)/(student)/plan/page";
import ProfilePage from "@/app/(app)/(student)/profile/page";
import AssessPage from "@/app/(focused)/assess/page";
import AssessmentPage from "@/app/(focused)/assessment/[id]/page";

const ACTOR = "11111111-1111-1111-1111-111111111111";

/** The nine pages that send a denied actor back through auth. */
const REDIRECTING: ReadonlyArray<{ name: string; call: () => Promise<unknown>; target: string }> = [
  { name: "/dashboard", call: () => DashboardPage(), target: "/auth?next=/dashboard" },
  { name: "/matches", call: () => MatchesPage(), target: "/auth?next=/matches" },
  { name: "/plan", call: () => PlanPage(), target: "/auth?next=/plan" },
  { name: "/documents", call: () => DocumentsPage(), target: "/auth?next=/documents" },
  { name: "/profile", call: () => ProfilePage(), target: "/auth?next=/profile" },
  { name: "/guide", call: () => GuidePage(), target: "/auth?next=/guide" },
  { name: "/checklist", call: () => ChecklistLandingPage(), target: "/auth?next=/checklist" },
  { name: "/checklist/all", call: () => GlobalChecklistPage(), target: "/auth?next=/checklist/all" },
  {
    name: "/checklist/[programId]",
    call: () => ProgramChecklistPage({ params: Promise.resolve({ programId: "p1" }) }),
    target: "/auth?next=/checklist/p1",
  },
];

describe("MV-157 §D — every migrated Server Component DENIES before it reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: ACTOR, email: "a@example.test" } } });
    resolvePersonalCaseId.mockResolvedValue("case-1");
    ensurePersonalCase.mockResolvedValue("case-1");
    redirect.mockImplementation((target: string) => {
      throw new NextRedirect(target);
    });
    notFound.mockImplementation(() => {
      throw new NextNotFound();
    });
  });

  it("covers all 12 Server Components — 9 redirect, 1 not-found, 2 degrade", () => {
    // A page added to §D without a row here is the gap this pins.
    expect(REDIRECTING).toHaveLength(9);
  });

  describe.each(REDIRECTING)("$name", ({ call, target }) => {
    it("redirects on a denial and issues ZERO queries", async () => {
      checkCasePermission.mockResolvedValue({
        decision: { allowed: false, reason: "not-a-member" },
        context: {},
      });

      await expect(call()).rejects.toBeInstanceOf(NextRedirect);
      expect(redirect).toHaveBeenCalledWith(target);
      expect(from).not.toHaveBeenCalled();
    });

    it("renders the empty state — not a redirect — when the actor has no personal case", async () => {
      // The other uncovered branch, and the one where getting it wrong is worse
      // than a 500: a redirect loop. An account with no personal case is a real,
      // benign state (pre-backfill, or a lost create race), and MV-157 §D's
      // answer is the same empty page a brand-new account sees.
      checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
      resolvePersonalCaseId.mockResolvedValue(null);

      await call();

      expect(redirect).not.toHaveBeenCalled();
      expect(checkCasePermission).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
    });
  });

  describe("/assessment/[id] — NOT-FOUND rather than redirect", () => {
    const PAYLOAD = {
      result: { verdict: "possible" },
      intake: { nearest: { name: "February", year: 2027, month: 2, status: "open", note: "n" }, alternatives: [] },
    };
    const CLAIMED_ROW = {
      id: "a1",
      owner: "someone-else",
      case_id: "case-of-someone-else",
      result: PAYLOAD,
      profile_snapshot: null,
      expires_at: "9999-12-31T00:00:00.000Z",
    };

    it("404s when the actor holds no case.read on the row's OWN case", async () => {
      // The half MV-151's registry flagged as "Stage 2 must re-scope it". A 404
      // rather than a 403 is deliberate: a 403 would confirm the assessment
      // exists to anyone who guesses an id.
      getAssessmentById.mockResolvedValue(CLAIMED_ROW);
      checkCasePermission.mockResolvedValue({ decision: { allowed: false }, context: {} });

      await expect(
        AssessmentPage({ params: Promise.resolve({ id: "a1" }) }),
      ).rejects.toBeInstanceOf(NextNotFound);
      expect(checkCasePermission).toHaveBeenCalledWith(
        ACTOR,
        "case-of-someone-else",
        "case.read",
        expect.anything(),
      );
    });

    it("authorizes against the ROW's case, never a case the caller resolved for themselves", async () => {
      // The "authorize a case you own, then read a row belonging to another" bug.
      // The case id handed to the check comes off the ROW.
      getAssessmentById.mockResolvedValue({ ...CLAIMED_ROW, case_id: "case-1" });
      checkCasePermission.mockResolvedValue({ decision: { allowed: false }, context: {} });

      await expect(
        AssessmentPage({ params: Promise.resolve({ id: "a1" }) }),
      ).rejects.toBeInstanceOf(NextNotFound);
      expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, "case-1", "case.read", expect.anything());
    });

    it("does NOT authorize an unclaimed, case-less row — id-as-credential survives (MV-28)", async () => {
      // The inverse assertion, and the one that would be deleted by an author
      // "finishing the migration": removing this breaks anonymous
      // refresh/back/tab-restore before sign-in.
      getUser.mockResolvedValue({ data: { user: null } });
      getRecoverableAssessment.mockResolvedValue({
        ...CLAIMED_ROW,
        owner: null,
        case_id: null,
      });

      await AssessmentPage({ params: Promise.resolve({ id: "a1" }) });

      expect(checkCasePermission).not.toHaveBeenCalled();
      expect(notFound).not.toHaveBeenCalled();
    });
  });

  describe("the two DEGRADE surfaces — neither may redirect, and neither may read", () => {
    it("(student)/layout drops the journey marker on a denial rather than redirecting", async () => {
      // The chrome must never be the thing that decides a student cannot see
      // their own app — but it must also not read the case it was refused.
      checkCasePermission.mockResolvedValue({ decision: { allowed: false }, context: {} });

      await StudentLayout({ children: null });

      expect(redirect).not.toHaveBeenCalled();
      expect(getJourneySignals).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
    });

    it("(student)/layout drops the journey marker when the actor has no personal case", async () => {
      checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
      resolvePersonalCaseId.mockResolvedValue(null);

      await StudentLayout({ children: null });

      expect(redirect).not.toHaveBeenCalled();
      expect(checkCasePermission).not.toHaveBeenCalled();
      expect(getJourneySignals).not.toHaveBeenCalled();
    });

    it("(focused)/assess drops the prior-assessment fork on a denial rather than redirecting", async () => {
      // The wizard must stay reachable: a denial here means "we cannot show you
      // your previous result", not "you may not assess".
      checkCasePermission.mockResolvedValue({ decision: { allowed: false }, context: {} });

      await AssessPage({ searchParams: Promise.resolve({}) });

      expect(redirect).not.toHaveBeenCalled();
      expect(getPrimaryAssessmentForCase).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
    });

    it("(focused)/assess drops the fork when the actor has no personal case", async () => {
      checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
      resolvePersonalCaseId.mockResolvedValue(null);

      await AssessPage({ searchParams: Promise.resolve({}) });

      expect(redirect).not.toHaveBeenCalled();
      expect(getPrimaryAssessmentForCase).not.toHaveBeenCalled();
    });
  });
});
