import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { getUser, getPrimaryAssessmentForCase, getProfileForCase, listDocumentsForCase, listAllPlanForCase, getOutcomesForCase, listShortlistForCase, listAllPrograms, listAllUniversities } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPrimaryAssessmentForCase: vi.fn(),
  getProfileForCase: vi.fn(),
  listDocumentsForCase: vi.fn(),
  listAllPlanForCase: vi.fn(),
  getOutcomesForCase: vi.fn(),
  listShortlistForCase: vi.fn(),
  listAllPrograms: vi.fn(),
  listAllUniversities: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForCase }));
vi.mock("@/lib/profiles/repo", () => ({ getProfileForCase }));
vi.mock("@/lib/documents/repo", () => ({ listDocumentsForCase }));
vi.mock("@/lib/plan/repo", () => ({ listAllPlanForCase }));
vi.mock("@/lib/outcomes/repo", () => ({ getOutcomesForCase }));
vi.mock("@/lib/matches/repo", () => ({ listShortlistForCase }));
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

// MV-195: the dashboard is where a student holding TWO cases is offered the second
// one. It is an affordance and nothing more — the personal case stays what every
// read below is scoped to (card decision B: never auto-switch).
const { listLinkedConsultancyCases } = vi.hoisted(() => ({ listLinkedConsultancyCases: vi.fn() }));
vi.mock("@/lib/cases/linked-consultancy-cases", () => ({ listLinkedConsultancyCases }));

beforeEach(() => {
  resolvePersonalCaseId.mockResolvedValue("case-1");
  ensurePersonalCase.mockResolvedValue("case-1");
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
  listLinkedConsultancyCases.mockResolvedValue({ ok: true, data: [] });
});

import DashboardPage from "@/app/(app)/(student)/dashboard/page";
import { CatalogReadError } from "@/lib/programs/errors";

describe("/dashboard page", () => {
  beforeEach(() => {
    getUser.mockReset();
    getPrimaryAssessmentForCase.mockReset();
    getProfileForCase.mockReset();
    listDocumentsForCase.mockReset();
    listAllPlanForCase.mockReset();
    listAllPlanForCase.mockResolvedValue([]);
    getOutcomesForCase.mockReset();
    getOutcomesForCase.mockResolvedValue({ predictions: [], attempts: [], events: [] });
    listShortlistForCase.mockReset();
    listShortlistForCase.mockResolvedValue([]);
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
    getPrimaryAssessmentForCase.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfileForCase.mockResolvedValue({ sections: { personal: { name: "Aarav Sharma" } }, completeness: 12 });
    listDocumentsForCase.mockResolvedValue([]);

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
    getPrimaryAssessmentForCase.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfileForCase.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForCase.mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    // The panel now exists AND is fed the real profile-completeness signal (80) —
    // it is no longer the data-less tracker that was removed.
    expect(screen.getByTestId("journey")).toHaveTextContent("journey:80");
  });

  it("does not render the always-empty 'Recent updates' panel (no source yet)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForCase.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfileForCase.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForCase.mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.queryByText(/Recent updates/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No updates yet/i)).not.toBeInTheDocument();
  });

  it("renders the empty snapshot when user has no primary assessment", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForCase.mockResolvedValue(null);
    getProfileForCase.mockResolvedValue(null);
    listDocumentsForCase.mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("snap")).toHaveTextContent("empty-snap");
    expect(screen.getByTestId("prompt")).toHaveTextContent("profile-incomplete");
  });

  it("never says caught up while the plan has open items (audit repro, inverted)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForCase.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfileForCase.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForCase.mockResolvedValue([]);
    listAllPlanForCase.mockResolvedValue([openItem]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("prompt")).toHaveTextContent("next:Upload your IELTS report");
  });

  it("is caught up only when the plan has zero open items", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForCase.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfileForCase.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForCase.mockResolvedValue([]);
    listAllPlanForCase.mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("prompt")).toHaveTextContent("caught-up");
  });

  it("reports waiting when every open item is in progress", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForCase.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfileForCase.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForCase.mockResolvedValue([]);
    listAllPlanForCase.mockResolvedValue([
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
    getPrimaryAssessmentForCase.mockResolvedValue(null);
    getProfileForCase.mockResolvedValue({ sections: { personal: { name: "Aarav" } }, completeness: 80 });
    listDocumentsForCase.mockResolvedValue([]);
    getOutcomesForCase.mockResolvedValue({
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

/**
 * MV-195 — the two-case experience (Stage 5 slice 3, criteria 7 and 8).
 *
 * The founder decision of 2026-08-24 keeps the two cases separate, and decision B
 * settles what that means at sign-in: **the personal case stays the default here and
 * the consultancy case is reached by an explicit, named affordance. Never
 * auto-switch.** Silently landing a student in a near-empty consultancy case would
 * read as data loss, which is the precise misreading this slice exists to prevent.
 *
 * Criterion 8 is the sharpest case and it lands on this page: a student who created
 * an account SOLELY to accept an invitation gets an auto-created empty personal case
 * (`finish-sign-in.ts` calls `ensurePersonalCase` on every sign-in), accepts fine,
 * and is redirected here. Before this slice, the case they made the account for was
 * invisible with no route to it.
 */
describe("/dashboard — the door to a consultancy case", () => {
  async function renderWith(linked: unknown) {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForCase.mockResolvedValue(null);
    getProfileForCase.mockResolvedValue(null);
    listDocumentsForCase.mockResolvedValue([]);
    listLinkedConsultancyCases.mockResolvedValue(linked);
    return render(await DashboardPage());
  }

  it("offers the case to a student who holds one — criterion 8's brand-new invited account", async () => {
    // The empty personal case is exactly what this student sees, so the affordance
    // is the only thing on the page that leads anywhere they care about.
    await renderWith({ ok: true, data: [{ id: "case-2", organizationId: "org-1", openedAt: "2026-08-20T00:00:00.000Z" }] });

    expect(screen.getByRole("link", { name: /your consultancy/i })).toHaveAttribute(
      "href",
      "/consultancy",
    );
  });

  it("says nothing about a consultancy to a student who has none", async () => {
    await renderWith({ ok: true, data: [] });

    expect(screen.queryByRole("link", { name: /your consultancy/i })).not.toBeInTheDocument();
  });

  it("keeps the door VISIBLE when the lookup failed", async () => {
    // A failed probe must not hide the only route to a case a student may well have.
    // The door stays; `/consultancy` is the page that owns the outage sentence,
    // because it is the one making the claim.
    await renderWith({ ok: false, reason: "lookup-failed" });

    expect(screen.getByRole("link", { name: /your consultancy/i })).toBeInTheDocument();
  });

  it("does NOT auto-switch — every read is still scoped to the PERSONAL case", async () => {
    // Decision B, and the regression that would matter most: the dashboard must keep
    // answering from `resolvePersonalCaseId`, never from the consultancy case it now
    // links to.
    await renderWith({ ok: true, data: [{ id: "case-2", organizationId: "org-1", openedAt: "2026-08-20T00:00:00.000Z" }] });

    expect(getPrimaryAssessmentForCase).toHaveBeenCalledWith(expect.anything(), "case-1");
    expect(getProfileForCase).toHaveBeenCalledWith(expect.anything(), "case-1");
    for (const call of getPrimaryAssessmentForCase.mock.calls) {
      expect(call).not.toContain("case-2");
    }
  });
});
