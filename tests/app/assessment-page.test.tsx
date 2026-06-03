import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getUser, getOwnedAssessment, redirect, notFound } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getOwnedAssessment: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getOwnedAssessment }));
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/components/results/results", () => ({
  Results: ({ mode }: { mode: string }) => <div>owned-results:{mode}</div>,
}));

import AssessmentPage from "@/app/assessment/[id]/page";

describe("/assessment/[id]", () => {
  beforeEach(() => {
    getUser.mockReset();
    getOwnedAssessment.mockReset();
    redirect.mockClear();
    notFound.mockClear();
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
  });
});
