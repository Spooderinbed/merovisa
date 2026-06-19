import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { getUser, getOwnedAssessment, redirect, notFound, listAllPrograms, listAllUniversities, assembleAssessment } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    getOwnedAssessment: vi.fn(),
    redirect: vi.fn(() => {
      throw new Error("REDIRECT");
    }),
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
vi.mock("@/lib/assessments/repo", () => ({ getOwnedAssessment }));
vi.mock("@/lib/programs/repo", () => ({ listAllPrograms, listAllUniversities }));
vi.mock("@/lib/results/assemble", () => ({ assembleAssessment }));
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/components/results/results", () => ({
  Results: ({ mode }: { mode: string }) => <div>owned-results:{mode}</div>,
}));

import AssessmentPage from "@/app/(focused)/assessment/[id]/page";

describe("/assessment/[id]", () => {
  beforeEach(() => {
    getUser.mockReset();
    getOwnedAssessment.mockReset();
    redirect.mockClear();
    notFound.mockClear();
    listAllPrograms.mockClear();
    assembleAssessment.mockClear();
  });

  it("redirects to /assess when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(AssessmentPage({ params: Promise.resolve({ id: "aid" }) })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/assess");
  });

  it("404s when the assessment is not owned / missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getOwnedAssessment.mockResolvedValue(null);
    await expect(AssessmentPage({ params: Promise.resolve({ id: "aid" }) })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders owned results from the stored payload", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getOwnedAssessment.mockResolvedValue({ id: "aid", owner: "u1", result: { result: { verdict: "possible" } } });
    const ui = await AssessmentPage({ params: Promise.resolve({ id: "aid" }) });
    render(ui);
    expect(screen.getByText("owned-results:owned")).toBeInTheDocument();
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
    expect(screen.getByText("owned-results:owned")).toBeInTheDocument();
    expect(listAllPrograms).toHaveBeenCalled();
    expect(assembleAssessment).toHaveBeenCalled();
  });
});
