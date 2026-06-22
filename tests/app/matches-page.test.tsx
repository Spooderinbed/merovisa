import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("server-only", () => ({}));

const { getUser, getProfile, listAllPrograms, listAllUniversities, listShortlistForUser } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    getProfile: vi.fn(),
    listAllPrograms: vi.fn(),
    listAllUniversities: vi.fn(),
    listShortlistForUser: vi.fn(),
  }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/profiles/repo", () => ({ getProfile }));
vi.mock("@/lib/programs/repo", () => ({ listAllPrograms, listAllUniversities }));
vi.mock("@/lib/matches/repo", () => ({ listShortlistForUser }));
// Mirror the dashboard-page test: surface the shared empty-profile gate's `kind`
// so we can assert /matches reuses the SAME PromptCard("profile-incomplete") gate.
vi.mock("@/components/dashboard/prompt-card", () => ({
  PromptCard: ({ prompt }: { prompt: { kind: string } }) => (
    <div data-testid="prompt">{prompt.kind}</div>
  ),
}));

import MatchesPage from "@/app/(app)/matches/page";

// A minimally-filled profile so the matches path runs (the empty/never-filled
// profile is gated; see the dedicated gate test below).
const FILLED_PROFILE = {
  sections: {
    academic: { institution: "TU", gradePercent: 72 },
    english: { test: "ielts", overall: 7 },
    finance: { total: 45000, currency: "AUD", source: "self" },
    "intended-study": { level: "masters", field: "computer-science" },
  },
};

describe("/matches page", () => {
  beforeEach(() => {
    [getUser, getProfile, listAllPrograms, listAllUniversities, listShortlistForUser].forEach(
      (m) => m.mockReset(),
    );
  });

  it("gates an empty profile with the dashboard's profile-incomplete gate, never fabricated verdicts", async () => {
    // A signed-in user who never filled their profile must NOT see verdicts
    // computed off fields they never entered (audit fix #3 — /matches empty-profile gate).
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getProfile.mockResolvedValue(null);
    // Programs exist — so without the gate the matcher would fabricate verdicts.
    listAllPrograms.mockResolvedValue([
      {
        id: "p1",
        universityId: "u1",
        name: "Master of IT",
        level: "masters",
        field: "computer-science",
        tuitionMin: 40000,
        tuitionMax: 40000,
        tuitionCurrency: "AUD",
        minGrade: 65,
        minEnglish: 6.5,
        minEnglishBand: 6,
        intakes: ["feb"],
        source: "https://x",
        lastVerified: "2026-01-01",
        dataQuality: "primary",
        notes: null,
      },
    ]);
    listAllUniversities.mockResolvedValue([
      {
        id: "u1",
        country: "AU",
        name: "Monash",
        city: "Melbourne",
        rankingTier: 1,
        source: "https://x",
        lastVerified: "2026-01-01",
        dataQuality: "primary",
      },
    ]);
    listShortlistForUser.mockResolvedValue([]);
    const ui = await MatchesPage();
    render(ui);
    // Same gate the dashboard renders.
    expect(screen.getByTestId("prompt")).toHaveTextContent("profile-incomplete");
    // No fabricated verdict groups or short-by reasons off never-entered fields.
    expect(screen.queryByText(/Strong matches/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reach matches/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/short by/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Master of IT")).not.toBeInTheDocument();
  });

  it("renders headline + policy banner + empty-state when no programs", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getProfile.mockResolvedValue(FILLED_PROFILE);
    listAllPrograms.mockResolvedValue([]);
    listAllUniversities.mockResolvedValue([]);
    listShortlistForUser.mockResolvedValue([]);
    const ui = await MatchesPage();
    render(ui);
    expect(screen.getByText(/Where your profile fits today/i)).toBeInTheDocument();
    expect(screen.getByText(/29,710/)).toBeInTheDocument();
    expect(screen.getByText(/What it costs to apply/i)).toBeInTheDocument();
    expect(screen.getByText(/No programs found yet/i)).toBeInTheDocument();
    // MV-05: the not-immigration-advice boundary rides above the matches.
    expect(screen.getByText(/not immigration advice/i)).toBeInTheDocument();
  });

  it("scholarships tab shows real sourced scholarships; cost tab shows the sourced first-year estimate", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getProfile.mockResolvedValue(FILLED_PROFILE);
    listAllPrograms.mockResolvedValue([]);
    listAllUniversities.mockResolvedValue([]);
    listShortlistForUser.mockResolvedValue([]);
    const ui = await MatchesPage();
    render(ui);
    await userEvent.click(screen.getByRole("button", { name: /Scholarships/i }));
    // Scholarships now surfaces real sourced data (Australia Awards first), framed
    // as a reference list — never a personalized eligibility claim.
    expect(screen.getAllByText(/Australia Awards/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a personalized eligibility check/i)).toBeInTheDocument();
    expect(screen.queryByText(/you qualify/i)).not.toBeInTheDocument();
    // Cost estimate now shows the real sourced first-year estimate (OSHC range live).
    await userEvent.click(screen.getByRole("button", { name: /Cost estimate/i }));
    expect(screen.getByText(/First-year cost estimate/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AUD 680–949" })).toBeInTheDocument();
    expect(screen.queryByText(/Coming soon/i)).not.toBeInTheDocument();
  });

  it("renders match groups when programs + profile present", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getProfile.mockResolvedValue({
      sections: {
        academic: { gradePercent: 72 },
        english: { overall: 7 },
        finance: { total: 45000, currency: "AUD" },
        "intended-study": { field: "computer-science" },
      },
    });
    listAllUniversities.mockResolvedValue([
      {
        id: "u1",
        country: "AU",
        name: "Monash",
        city: "Melbourne",
        rankingTier: 1,
        source: "https://x",
        lastVerified: "2026-01-01",
        dataQuality: "primary",
      },
    ]);
    listAllPrograms.mockResolvedValue([
      {
        id: "p1",
        universityId: "u1",
        name: "Master of IT",
        level: "masters",
        field: "computer-science",
        tuitionMin: 40000,
        tuitionMax: 40000,
        tuitionCurrency: "AUD",
        minGrade: 65,
        minEnglish: 6.5,
        minEnglishBand: 6,
        intakes: ["feb"],
        source: "https://x",
        lastVerified: "2026-01-01",
        dataQuality: "primary",
        notes: null,
      },
    ]);
    listShortlistForUser.mockResolvedValue([]);

    const ui = await MatchesPage();
    render(ui);
    expect(screen.getByText(/Strong matches \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText("Master of IT")).toBeInTheDocument();
  });
});
