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
  SectionAccordion: ({ title, status }: { title: string; status: string }) => (
    <div data-testid={`section-${title}`}>{title}:{status}</div>
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
});
