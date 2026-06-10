import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { getUser, getProfile } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/profiles/repo", () => ({ getProfile }));
vi.mock("@/components/profile/completeness-ring", () => ({
  CompletenessRing: ({ pct }: { pct: number }) => <div data-testid="ring">{pct}%</div>,
}));
vi.mock("@/components/profile/section-accordion", () => ({
  SectionAccordion: ({ title, status, summary }: { title: string; status: string; summary: string }) => (
    <div data-testid={`section-${title}`}>{title}:{status}:{summary}</div>
  ),
}));

import ProfilePage from "@/app/(app)/profile/page";

describe("/profile page", () => {
  beforeEach(() => {
    getUser.mockReset();
    getProfile.mockReset();
  });

  it("renders name + email at top and 13 sections", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getProfile.mockResolvedValue({
      sections: { personal: { name: "Aarav Sharma" } },
      completeness: 8,
    });
    const ui = await ProfilePage();
    render(ui);
    expect(screen.getByText("Aarav Sharma")).toBeInTheDocument();
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByTestId("ring")).toHaveTextContent("8%");
    expect(screen.getByTestId("section-Personal information")).toBeInTheDocument();
    expect(screen.getByTestId("section-Destination preferences")).toBeInTheDocument();
  });

  it("derives row summaries and ring from current profile data on each server render (refresh contract)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getProfile.mockResolvedValueOnce({ sections: { personal: { name: "Aarav Sharma" } } });
    const first = render(await ProfilePage());
    expect(screen.getByTestId("section-Personal information")).toHaveTextContent("Aarav Sharma");
    expect(screen.getByTestId("ring")).toHaveTextContent("8%");
    first.unmount();

    // After a section save, router.refresh() re-runs the page with fresh data:
    getProfile.mockResolvedValueOnce({
      sections: {
        personal: { name: "Aarav Sharma", age: 23 },
        career: { goal: "research" },
      },
    });
    render(await ProfilePage());
    expect(screen.getByTestId("section-Personal information")).toHaveTextContent("Aarav Sharma · 23");
    expect(screen.getByTestId("section-Career goals")).toHaveTextContent(/research/i);
    expect(screen.getByTestId("ring")).toHaveTextContent("15%");
  });
});
