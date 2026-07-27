import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { getUser, getPrimaryAssessmentForUser, getProfile, listDocumentsForUser, listAllPlanForUser, getOutcomesForUser, listShortlistForUser, listAllPrograms, listAllUniversities } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPrimaryAssessmentForUser: vi.fn(),
  getProfile: vi.fn(),
  listDocumentsForUser: vi.fn(),
  listAllPlanForUser: vi.fn(),
  getOutcomesForUser: vi.fn(),
  listShortlistForUser: vi.fn(),
  listAllPrograms: vi.fn(),
  listAllUniversities: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForUser }));
vi.mock("@/lib/profiles/repo", () => ({ getProfile }));
vi.mock("@/lib/documents/repo", () => ({ listDocumentsForUser }));
vi.mock("@/lib/plan/repo", () => ({ listAllPlanForUser }));
vi.mock("@/lib/outcomes/repo", () => ({ getOutcomesForUser }));
vi.mock("@/lib/matches/repo", () => ({ listShortlistForUser }));
vi.mock("@/lib/programs/repo", () => ({ listAllPrograms, listAllUniversities }));
vi.mock("@/components/dashboard/snapshot-card", () => ({
  SnapshotCard: ({ primary }: { primary: unknown }) => <div data-testid="snap">{primary ? "has-snap" : "empty-snap"}</div>,
}));
vi.mock("@/components/dashboard/prompt-card", () => ({
  PromptCard: ({ prompt }: { prompt: { kind: string; item?: { title: string } } }) => (
    <div data-testid="prompt">{prompt.kind}{prompt.item ? `:${prompt.item.title}` : ""}</div>
  ),
}));
vi.mock("@/components/dashboard/greeting", () => ({
  Greeting: ({ name }: { name: string | null }) => <div data-testid="greet">{name ?? "anon"}</div>,
}));
vi.mock("@/components/dashboard/readiness-map",   () => ({ ReadinessMap:    () => <div data-testid="rm" /> }));
// Surface the derived profilePct signal so the wiring (real data → real panel) is asserted.
vi.mock("@/components/dashboard/journey-rail", () => ({
  JourneyRail: ({ signals }: { signals: { profilePct: number } }) => (
    <div data-testid="journey">journey:{signals.profilePct}</div>
  ),
}));

import DashboardPage from "@/app/(app)/dashboard/page";
import { CatalogReadError } from "@/lib/programs/errors";

describe("/dashboard page", () => {
  beforeEach(() => {
    getUser.mockReset();
    getPrimaryAssessmentForUser.mockReset();
    getProfile.mockReset();
    listDocumentsForUser.mockReset();
    listAllPlanForUser.mockReset();
    listAllPlanForUser.mockResolvedValue([]);
    getOutcomesForUser.mockReset();
    getOutcomesForUser.mockResolvedValue({ predictions: [], attempts: [], events: [] });
    listShortlistForUser.mockReset();
    listShortlistForUser.mockResolvedValue([]);
    listAllPrograms.mockReset();
    listAllPrograms.mockResolvedValue([]);
    listAllUniversities.mockReset();
    listAllUniversities.mockResolvedValue([]);
  });

  const openItem = {
    id: 1,
    owner: "u1",
    kind: "upload-ielts-report",
    impact: "medium",
    title: "Upload your IELTS report",
    body: null,
    liftEstimate: null,
    timeEstimate: null,
    status: "todo",
    createdAt: "2026-06-10",
    completedAt: null,
    startedAt: null,
  };

  it("renders the kept sections for a signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfile.mockResolvedValue({ sections: { personal: { name: "Aarav Sharma" } }, completeness: 12 });
    listDocumentsForUser.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("greet")).toHaveTextContent("Aarav Sharma");
    expect(screen.getByTestId("snap")).toHaveTextContent("has-snap");
    expect(screen.getByTestId("prompt")).toBeInTheDocument();
    expect(screen.getByTestId("rm")).toBeInTheDocument();
    expect(screen.getByTestId("journey")).toBeInTheDocument();
  });

  it("renders the real, signal-backed 'Your journey' panel (the old fake empty tracker is gone)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfile.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForUser.mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    // The panel now exists AND is fed the real profile-completeness signal (80) —
    // it is no longer the data-less tracker that was removed.
    expect(screen.getByTestId("journey")).toHaveTextContent("journey:80");
  });

  it("does not render the always-empty 'Recent updates' panel (no source yet)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfile.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForUser.mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.queryByText(/Recent updates/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No updates yet/i)).not.toBeInTheDocument();
  });

  it("renders the empty snapshot when user has no primary assessment", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    getProfile.mockResolvedValue(null);
    listDocumentsForUser.mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("snap")).toHaveTextContent("empty-snap");
    expect(screen.getByTestId("prompt")).toHaveTextContent("profile-incomplete");
  });

  it("never says caught up while the plan has open items (audit repro, inverted)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfile.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForUser.mockResolvedValue([]);
    listAllPlanForUser.mockResolvedValue([openItem]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("prompt")).toHaveTextContent("next:Upload your IELTS report");
  });

  it("is caught up only when the plan has zero open items", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfile.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForUser.mockResolvedValue([]);
    listAllPlanForUser.mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("prompt")).toHaveTextContent("caught-up");
  });

  it("reports waiting when every open item is in progress", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfile.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForUser.mockResolvedValue([]);
    listAllPlanForUser.mockResolvedValue([
      { ...openItem, kind: "apply-for-noc", startedAt: "2026-06-10T00:00:00Z" },
    ]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("prompt")).toHaveTextContent("waiting");
  });

  // MV-133, the audited exception: the dashboard reads the catalogue only to put program
  // NAMES on outcome-funnel rows. Unlike /matches, nothing here is presented as "we found
  // nothing for you", so a failed lookup must not take the whole hub down with it — the
  // student keeps their plan, snapshot and readiness. Every other read path propagates.
  it("still renders when the catalogue name-lookup for the outcome funnel fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    getProfile.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForUser.mockResolvedValue([]);
    getOutcomesForUser.mockResolvedValue({
      predictions: [],
      attempts: [{ id: "at1", owner: "u1", predictionId: "pr1", programId: "p1" }],
      events: [],
    });
    listAllPrograms.mockRejectedValue(new CatalogReadError("programs"));
    listAllUniversities.mockRejectedValue(new CatalogReadError("universities"));

    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("greet")).toHaveTextContent("Aarav");
  });
});
