import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const {
  getUser,
  getAssessmentById,
  getRecoverableAssessment,
  notFound,
  listAllPrograms,
  listAllUniversities,
  assembleAssessment,
  renderResults,
  scoringRulesStale,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAssessmentById: vi.fn(),
  getRecoverableAssessment: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  listAllPrograms: vi.fn().mockResolvedValue([]),
  listAllUniversities: vi.fn().mockResolvedValue([]),
  assembleAssessment: vi.fn(),
  renderResults: vi.fn(),
  scoringRulesStale: vi.fn(() => false),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/assessments/repo", () => ({ getAssessmentById, getRecoverableAssessment }));
vi.mock("@/lib/programs/repo", () => ({ listAllPrograms, listAllUniversities }));
vi.mock("@/lib/results/assemble", () => ({ assembleAssessment }));
vi.mock("@/lib/data/scoring-freshness", () => ({ scoringRulesStale }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/results/results", () => ({
  Results: (props: { mode: string; assessmentId: string | null; payload: unknown }) => {
    renderResults(props);
    return <div>results:{props.mode}:{props.assessmentId ?? "none"}</div>;
  },
}));

// MV-157: every migrated route and page resolves the actor's personal case and
// authorizes it before its first query. Both are mocked to the happy path here;
// the denial branch is asserted where the route owns it.
const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  ensurePersonalCase: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));
beforeEach(() => {
  resolvePersonalCaseId.mockResolvedValue("case-1");
  ensurePersonalCase.mockResolvedValue("case-1");
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
});

import AssessmentPage from "@/app/(focused)/assessment/[id]/page";

// Minimal valid intake timing — page.tsx computes the SSR timeline from it (MV-118 #11).
const INTAKE = {
  nearest: { name: "February", year: 2027, month: 2, status: "open", note: "n" },
  alternatives: [],
};

describe("/assessment/[id]", () => {
  beforeEach(() => {
    getUser.mockReset();
    getAssessmentById.mockReset();
    getRecoverableAssessment.mockReset();
    notFound.mockClear();
    listAllPrograms.mockClear();
    listAllUniversities.mockClear();
    assembleAssessment.mockClear();
    renderResults.mockClear();
    scoringRulesStale.mockReset();
    scoringRulesStale.mockReturnValue(false);
  });

  // MV-132. A stored payload replays verbatim, so the `rulesStale` flag captured when
  // the assessment was scored would keep saying "all rules current" long after a
  // reverifyBy passed — showing the calm "rules verified …" line over a verdict whose
  // inputs are overdue. FX made this reachable: it is the first scoring input with a
  // near-term deadline. The dashboard already recomputed; this page did not.
  describe("stale-rule degrade on a stored assessment", () => {
    const storedWith = (rulesStale: boolean) => ({
      id: "aid",
      owner: "u1",
      result: { result: { verdict: "possible" }, intake: INTAKE, rulesStale },
    });
    const renderedPayload = () =>
      (renderResults.mock.calls[0]![0] as { payload: { rulesStale?: boolean } }).payload;

    it("degrades a verdict stored as current once a rule has since aged out", async () => {
      getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
      getAssessmentById.mockResolvedValue(storedWith(false));
      scoringRulesStale.mockReturnValue(true); // the clock has crossed a reverifyBy

      render(await AssessmentPage({ params: Promise.resolve({ id: "aid" }) }));
      expect(renderedPayload().rulesStale).toBe(true);
    });

    it("leaves a verdict alone while every rule is still current", async () => {
      getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
      getAssessmentById.mockResolvedValue(storedWith(false));

      render(await AssessmentPage({ params: Promise.resolve({ id: "aid" }) }));
      expect(renderedPayload().rulesStale).toBe(false);
    });

    it("never un-flags a verdict that was already stale when it was scored", async () => {
      // OR, not overwrite: the stored verdict really was computed off overdue inputs,
      // and a later re-verification of the config does not retroactively fix it.
      getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
      getAssessmentById.mockResolvedValue(storedWith(true));
      scoringRulesStale.mockReturnValue(false);

      render(await AssessmentPage({ params: Promise.resolve({ id: "aid" }) }));
      expect(renderedPayload().rulesStale).toBe(true);
    });
  });

  it("renders recoverable anonymous results (with the assessment id) when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    getRecoverableAssessment.mockResolvedValue({ id: "aid", owner: null, expires_at: "2027-01-01T00:00:00.000Z", result: { result: { verdict: "possible" }, intake: INTAKE } });
    const ui = await AssessmentPage({ params: Promise.resolve({ id: "aid" }) });
    render(ui);
    // Anonymous recovery shows the conversion/claim path keyed by the assessment id.
    expect(screen.getByText("results:anonymous:aid")).toBeInTheDocument();
    expect(getAssessmentById).not.toHaveBeenCalled();
  });

  it("404s when signed out and the assessment is not recoverable (claimed / expired / missing)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    getRecoverableAssessment.mockResolvedValue(null);
    await expect(AssessmentPage({ params: Promise.resolve({ id: "aid" }) })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("404s when signed in and the assessment is not owned / missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getAssessmentById.mockResolvedValue(null);
    await expect(AssessmentPage({ params: Promise.resolve({ id: "aid" }) })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(getRecoverableAssessment).not.toHaveBeenCalled();
  });

  it("renders owned results from the stored payload", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getAssessmentById.mockResolvedValue({ id: "aid", owner: "u1", result: { result: { verdict: "possible" }, intake: INTAKE } });
    const ui = await AssessmentPage({ params: Promise.resolve({ id: "aid" }) });
    render(ui);
    expect(screen.getByText("results:owned:none")).toBeInTheDocument();
    // A current-shape payload renders as-is, with no legacy recompute.
    expect(assembleAssessment).not.toHaveBeenCalled();
  });

  it("recomputes a legacy accuracy meter from the stored profile snapshot", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getAssessmentById.mockResolvedValue({
      id: "aid",
      owner: "u1",
      destination_id: "australia",
      expires_at: "9999-12-31T00:00:00.000Z",
      profile_snapshot: {
        educationLevel: "bachelors",
        grade: 72,
        fieldOfStudy: "computer-science",
        englishStatus: "taken",
        englishScore: 7,
        budget: 4_500_000,
        priorRefusals: "none",
      },
      result: {
        result: { verdict: "possible" },
        intake: INTAKE,
        matches: [],
        accuracy: {
          completeness: 28,
          level: "Basic",
          suggestions: [
            { id: "transcript", label: "Upload your transcript", gain: "keep it on file" },
          ],
        },
      },
    });

    const ui = await AssessmentPage({ params: Promise.resolve({ id: "aid" }) });
    render(ui);

    expect(renderResults).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          accuracy: { completeness: 100, level: "Full picture", suggestions: [] },
        }),
      }),
    );
    expect(assembleAssessment).not.toHaveBeenCalled();
  });

  it("keeps a current completeness meter instead of overwriting it from an older snapshot", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const current = {
      completeness: 92,
      level: "Detailed",
      suggestions: [
        { id: "refusals", label: "Add your visa history", gain: "so your visa risk reflects your real record" },
      ],
    };
    getAssessmentById.mockResolvedValue({
      id: "aid",
      owner: "u1",
      destination_id: "australia",
      expires_at: "9999-12-31T00:00:00.000Z",
      // The primary result can be re-scored from live profile sections without updating
      // this original snapshot, so normalisation must be legacy-only.
      profile_snapshot: {
        educationLevel: "bachelors",
        grade: 72,
        fieldOfStudy: "computer-science",
        englishStatus: "taken",
        englishScore: 7,
        budget: 4_500_000,
        priorRefusals: "none",
      },
      result: {
        result: { verdict: "possible" },
        intake: INTAKE,
        matches: [],
        accuracy: current,
      },
    });

    const ui = await AssessmentPage({ params: Promise.resolve({ id: "aid" }) });
    render(ui);

    expect(renderResults.mock.calls[0]?.[0].payload.accuracy).toBe(current);
  });

  it("recomputes matches for a legacy payload from the stored profile snapshot", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    // Legacy payload: university-level matches (no .program) the current UI can't render.
    getAssessmentById.mockResolvedValue({
      id: "aid",
      owner: "u1",
      result: { result: { verdict: "possible" }, intake: INTAKE, matches: [{ university: { id: "u0" }, matchLevel: "possible" }] },
      profile_snapshot: { grade: 72, gradeSystem: "percentage-nepal", educationLevel: "bachelors" },
    });
    assembleAssessment.mockReturnValue({ matches: [], matchedCount: 0, preferenceNote: null });
    const ui = await AssessmentPage({ params: Promise.resolve({ id: "aid" }) });
    render(ui);
    expect(screen.getByText("results:owned:none")).toBeInTheDocument();
    expect(listAllPrograms).toHaveBeenCalled();
    expect(assembleAssessment).toHaveBeenCalled();
  });
});
