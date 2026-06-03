import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { getUser, getPrimaryAssessmentForUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPrimaryAssessmentForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForUser }));
vi.mock("@/components/assess/assess-flow", () => ({
  AssessFlow: ({ signedIn }: { signedIn?: boolean }) => (
    <div data-testid="flow" data-signed-in={!!signedIn}>
      flow
    </div>
  ),
}));
vi.mock("@/components/assess/assess-interstitial", () => ({
  AssessInterstitial: () => <div data-testid="interstitial">interstitial</div>,
}));

import AssessPage from "@/app/(focused)/assess/page";

describe("/assess server-side fork", () => {
  beforeEach(() => {
    getUser.mockReset();
    getPrimaryAssessmentForUser.mockReset();
  });

  it("renders AssessFlow when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AssessPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByTestId("flow")).toBeInTheDocument();
    expect(screen.getByTestId("flow")).toHaveAttribute("data-signed-in", "false");
  });

  it("renders AssessFlow when signed in but no primary", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    const ui = await AssessPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByTestId("flow")).toBeInTheDocument();
    expect(screen.getByTestId("flow")).toHaveAttribute("data-signed-in", "true");
  });

  it("renders interstitial when signed in with primary and no new=1", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({ id: "a1", destination_id: "australia", created_at: "2026-05-15T00:00:00Z" });
    const ui = await AssessPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByTestId("interstitial")).toBeInTheDocument();
  });

  it("renders AssessFlow when new=1 even if primary exists", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({ id: "a1", destination_id: "australia", created_at: "2026-05-15T00:00:00Z" });
    const ui = await AssessPage({ searchParams: Promise.resolve({ new: "1" }) });
    render(ui);
    expect(screen.getByTestId("flow")).toBeInTheDocument();
    expect(screen.getByTestId("flow")).toHaveAttribute("data-signed-in", "true");
  });
});
