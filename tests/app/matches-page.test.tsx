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

  it("gates a name-only profile (non-empty sections, no verdict inputs) with the same prompt (C-4)", async () => {
    // Audit C-4 "Unknown is not zero": a signed-in student who typed only their name
    // has a NON-empty profile, so the old `Object.keys(sections).length === 0` gate let
    // them fall through to the matcher, which floors every unknown to 0 and fabricated
    // "Reach · Grade short by 65%" cards. hasSufficientInputs closes that hole.
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getProfile.mockResolvedValue({
      sections: {
        personal: { name: "Asha" },
        "intended-study": { field: "computer-science", level: "masters" },
      },
    });
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
    // Same profile-incomplete gate the empty profile renders — never fabricated bands.
    expect(screen.getByTestId("prompt")).toHaveTextContent("profile-incomplete");
    expect(screen.queryByText(/short by/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Master of IT")).not.toBeInTheDocument();
  });

  it("still renders match cards for a partial profile with one verdict input present (no over-gating)", async () => {
    // The over-gating guard: a grade-only profile (English + budget still absent) is
    // sufficient — it produced partial verdicts before and must keep doing so. Gating
    // it would wall a student who gave us something to score, which is its own bounce.
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getProfile.mockResolvedValue({
      sections: {
        academic: { gradePercent: 72 },
        "intended-study": { field: "computer-science", level: "masters" },
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
    // Not gated: the match card is on the page.
    expect(screen.queryByTestId("prompt")).not.toBeInTheDocument();
    expect(screen.getByText("Master of IT")).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("tab", { name: /Scholarships/i }));
    // Scholarships now surfaces real sourced data (Australia Awards first), framed
    // as a reference list — never a personalized eligibility claim.
    expect(screen.getAllByText(/Australia Awards/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a personalized eligibility check/i)).toBeInTheDocument();
    expect(screen.queryByText(/you qualify/i)).not.toBeInTheDocument();
    // Cost estimate now shows the real sourced first-year estimate (OSHC range live).
    await userEvent.click(screen.getByRole("tab", { name: /Cost estimate/i }));
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
        // MV-120: 70,000 clears tuition 40,000 + living 29,710 = 69,710. Was 45,000 back
        // when a budget was judged against tuition alone; that student is really a reach
        // (see the C-3 test below), so this fixture would no longer render a strong group.
        finance: { total: 70000, currency: "AUD" },
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

  /**
   * MV-120 / audit C-3, asserted at the surface the student actually reads. This is the
   * audit's exact case: a 45,000 AUD budget -- which the wizard defines as tuition PLUS
   * living costs -- against a 40,000 tuition. The page headed it "Strong matches (1)"
   * while lib/scoring/financial.ts, reading the same number, called the same student a
   * reach. A page-level guard that the fix is not merely engine-deep.
   */
  it("does not call a budget that covers tuition but not living costs a strong match (C-3)", async () => {
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
    // They need 40,000 + 29,710 = 69,710 and are ~24,710 short, so the honest band is
    // Reach. (Its groupLabel is "Reach", not "Reach matches" -- see verdict-labels.)
    expect(screen.getByText(/Reach \(1\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/Strong matches/i)).not.toBeInTheDocument();
  });

  /**
   * MV-121. MV-120 deflated most students to all-Reach (the C-3 case above is exactly
   * one: 45,000 budget, one program, a single reach). The page collapsed Reach behind
   * `initialVisible={0}`, so an all-Reach student saw only a heading and a "Show 1 reach
   * match" button -- zero cards -- at the moment they most need to read *why* they're
   * short. When Reach is all there is, its cards must actually render.
   */
  it("renders the reach cards (not just a heading + Show button) when every match is a Reach (MV-121)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getProfile.mockResolvedValue({
      sections: {
        academic: { gradePercent: 72 },
        english: { overall: 7 },
        finance: { total: 45000, currency: "AUD" }, // short of tuition + living -> all reach
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
    // The band is unchanged (still Reach) -- this card does not re-inflate verdicts.
    expect(screen.getByText(/Reach \(1\)/i)).toBeInTheDocument();
    // The actual reach card is on screen, not hidden behind a collapse.
    expect(screen.getByText("Master of IT")).toBeInTheDocument();
    // And the page is not just a heading + a "Show 1 reach match" button.
    expect(
      screen.queryByRole("button", { name: /Show \d+ reach match/i }),
    ).not.toBeInTheDocument();
  });

  /**
   * MV-121 must not undo the wall-of-cards protection for students who DO have better
   * bands. When a Strong (or Possible) exists, Reach stays collapsed exactly as before.
   */
  it("keeps the reach group collapsed when the student has a stronger band (MV-121)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getProfile.mockResolvedValue({
      sections: {
        academic: { gradePercent: 72 },
        english: { overall: 7 },
        // Budget 70,000 clears 40,000 + 29,710 = 69,710, so p1 (minGrade 65) is a strong.
        // p2 demands minGrade 90, a 18-point gap (> 10) -> an unambiguous reach regardless
        // of budget. A mixed student, so Reach should stay behind its count.
        finance: { total: 70000, currency: "AUD" },
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
      {
        id: "p2",
        universityId: "u1",
        name: "Master of Data Science",
        level: "masters",
        field: "computer-science",
        tuitionMin: 55000,
        tuitionMax: 55000,
        tuitionCurrency: "AUD",
        minGrade: 90,
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
    // Strong carries the page and is visible.
    expect(screen.getByText(/Strong matches \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText("Master of IT")).toBeInTheDocument();
    // Reach is present but collapsed: its count shows, its card does not, and the reveal
    // button is there.
    expect(screen.getByText(/Reach \(1\)/i)).toBeInTheDocument();
    expect(screen.queryByText("Master of Data Science")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Show 1 reach match/i }),
    ).toBeInTheDocument();
  });

  /**
   * MV-140 / audit C-10. A Law student's field has zero catalogue programs, but field is a
   * soft sort (not a hard filter), so the page still surfaces off-field programs. It must
   * say plainly we don't list Law yet, rather than presenting nursing/IT as their matches.
   */
  it("discloses when the student's intended field is not in the catalogue (audit C-10)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getProfile.mockResolvedValue({
      sections: {
        academic: { gradePercent: 72 },
        english: { overall: 7 },
        finance: { total: 70000, currency: "AUD" },
        "intended-study": { level: "masters", field: "law" }, // no Law in the catalogue below
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

    const { container } = render(await MatchesPage());
    const text = container.textContent ?? "";
    // The honest disclosure is on the page, naming the uncovered field.
    expect(text).toMatch(/don.t list/i);
    expect(text).toMatch(/Law/);
  });
});
