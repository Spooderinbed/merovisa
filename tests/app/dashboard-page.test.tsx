import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { getUser, getPrimaryAssessmentForUser, getProfile, listShortlistForUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPrimaryAssessmentForUser: vi.fn(),
  getProfile: vi.fn(),
  listShortlistForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForUser }));
vi.mock("@/lib/profiles/repo", () => ({ getProfile }));
vi.mock("@/lib/matches/repo", () => ({ listShortlistForUser }));
vi.mock("@/components/dashboard/snapshot-card", () => ({
  SnapshotCard: ({ primary }: { primary: unknown }) => <div data-testid="snap">{primary ? "has-snap" : "empty-snap"}</div>,
}));
vi.mock("@/components/dashboard/prompt-card", () => ({
  PromptCard: ({ kind }: { kind: string }) => <div data-testid="prompt">{kind}</div>,
}));
vi.mock("@/components/dashboard/greeting", () => ({
  Greeting: ({ name }: { name: string | null }) => <div data-testid="greet">{name ?? "anon"}</div>,
}));
vi.mock("@/components/dashboard/journey-timeline", () => ({ JourneyTimeline: () => <div data-testid="jt" /> }));
vi.mock("@/components/dashboard/stats-row",       () => ({ StatsRow:        () => <div data-testid="sr" /> }));
vi.mock("@/components/dashboard/recent-updates",  () => ({ RecentUpdates:   () => <div data-testid="ru" /> }));

import DashboardPage from "@/app/(app)/dashboard/page";

describe("/dashboard page", () => {
  beforeEach(() => {
    getUser.mockReset();
    getPrimaryAssessmentForUser.mockReset();
    getProfile.mockReset();
    listShortlistForUser.mockReset();
  });

  it("renders all five sections for a signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfile.mockResolvedValue({ sections: { personal: { name: "Aarav Sharma" } }, completeness: 12 });
    listShortlistForUser.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("greet")).toHaveTextContent("Aarav Sharma");
    expect(screen.getByTestId("snap")).toHaveTextContent("has-snap");
    expect(screen.getByTestId("prompt")).toBeInTheDocument();
    expect(screen.getByTestId("jt")).toBeInTheDocument();
    expect(screen.getByTestId("sr")).toBeInTheDocument();
    expect(screen.getByTestId("ru")).toBeInTheDocument();
  });

  it("renders the empty snapshot when user has no primary assessment", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    getProfile.mockResolvedValue(null);
    listShortlistForUser.mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("snap")).toHaveTextContent("empty-snap");
  });
});
