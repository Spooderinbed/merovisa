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

const GROUP_TITLES = [
  "About you",
  "Destination & intake",
  "Academic background",
  "Study & career goals",
  "English proficiency",
  "Work & study gap",
  "Money & scholarships",
  "Visa history",
];

describe("/profile page", () => {
  beforeEach(() => {
    getUser.mockReset();
    getProfile.mockReset();
  });

  it("renders name + email at top and exactly the 8 approved group rows", async () => {
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
    for (const title of GROUP_TITLES) {
      expect(screen.getByTestId(`section-${title}`)).toBeInTheDocument();
    }
    expect(screen.getAllByTestId(/^section-/)).toHaveLength(8);
  });

  it("derives a partial group row from a complete + not-started member mix", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    // personal complete (name present), family not started -> About you partial
    getProfile.mockResolvedValue({ sections: { personal: { name: "Aarav Sharma" } } });
    render(await ProfilePage());
    expect(screen.getByTestId("section-About you")).toHaveTextContent("About you:partial");
    // both members complete -> complete
    expect(screen.getByTestId("section-Visa history")).toHaveTextContent("Visa history:empty");
  });

  it("derives row summaries and ring from current profile data on each server render (refresh contract)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getProfile.mockResolvedValueOnce({ sections: { personal: { name: "Aarav Sharma" } } });
    const first = render(await ProfilePage());
    expect(screen.getByTestId("section-About you")).toHaveTextContent("Aarav Sharma");
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
    expect(screen.getByTestId("section-About you")).toHaveTextContent("Aarav Sharma · 23");
    expect(screen.getByTestId("section-Study & career goals")).toHaveTextContent(/research/i);
    expect(screen.getByTestId("ring")).toHaveTextContent("15%");
  });

  it("shows the intake date on the Destination & intake row, not About you", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getProfile.mockResolvedValue({
      sections: {
        personal: { name: "Aarav", intakeIso: "2027-07-01" },
        destination: { primary: "australia" },
      },
    });
    render(await ProfilePage());
    expect(screen.getByTestId("section-Destination & intake")).toHaveTextContent(
      "Australia · 2027-07-01 intake",
    );
    expect(screen.getByTestId("section-About you")).not.toHaveTextContent("intake");
  });
});
