import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const {
  getUser,
  getOwnedAssessment,
  getRecoverableAssessment,
  notFound,
  listAllPrograms,
  listAllUniversities,
  assembleAssessment,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  getOwnedAssessment: vi.fn(),
  getRecoverableAssessment: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  listAllPrograms: vi.fn().mockResolvedValue([]),
  listAllUniversities: vi.fn().mockResolvedValue([]),
  assembleAssessment: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/assessments/repo", () => ({ getOwnedAssessment, getRecoverableAssessment }));
vi.mock("@/lib/programs/repo", () => ({ listAllPrograms, listAllUniversities }));
vi.mock("@/lib/results/assemble", () => ({ assembleAssessment }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/results/results", () => ({
  Results: ({ mode, assessmentId }: { mode: string; assessmentId: string | null }) => (
    <div>results:{mode}:{assessmentId ?? "none"}</div>
  ),
}));

import AssessmentPage from "@/app/(focused)/assessment/[id]/page";

describe("/assessment/[id]", () => {
  beforeEach(() => {
    getUser.mockReset();
    getOwnedAssessment.mockReset();
    getRecoverableAssessment.mockReset();
    notFound.mockClear();
    listAllPrograms.mockClear();
    listAllUniversities.mockClear();
    assembleAssessment.mockClear();
  });

  it("renders recoverable anonymous results (with the assessment id) when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    getRecoverableAssessment.mockResolvedValue({ id: "aid", owner: null, result: { result: { verdict: "possible" } } });
    const ui = await AssessmentPage({ params: Promise.resolve({ id: "aid" }) });
    render(ui);
    // Anonymous recovery shows the conversion/claim path keyed by the assessment id.
    expect(screen.getByText("results:anonymous:aid")).toBeInTheDocument();
    expect(getOwnedAssessment).not.toHaveBeenCalled();
  });

  it("404s when signed out and the assessment is not recoverable (claimed / expired / missing)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    getRecoverableAssessment.mockResolvedValue(null);
    await expect(AssessmentPage({ params: Promise.resolve({ id: "aid" }) })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("404s when signed in and the assessment is not owned / missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getOwnedAssessment.mockResolvedValue(null);
    await expect(AssessmentPage({ params: Promise.resolve({ id: "aid" }) })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(getRecoverableAssessment).not.toHaveBeenCalled();
  });

  it("renders owned results from the stored payload", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getOwnedAssessment.mockResolvedValue({ id: "aid", owner: "u1", result: { result: { verdict: "possible" } } });
    const ui = await AssessmentPage({ params: Promise.resolve({ id: "aid" }) });
    render(ui);
    expect(screen.getByText("results:owned:none")).toBeInTheDocument();
    // A current-shape payload renders as-is, with no legacy recompute.
    expect(assembleAssessment).not.toHaveBeenCalled();
  });

  it("recomputes matches for a legacy payload from the stored profile snapshot", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    // Legacy payload: university-level matches (no .program) the current UI can't render.
    getOwnedAssessment.mockResolvedValue({
      id: "aid",
      owner: "u1",
      result: { result: { verdict: "possible" }, matches: [{ university: { id: "u0" }, matchLevel: "possible" }] },
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
