import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { startClaimOAuth } = vi.hoisted(() => ({ startClaimOAuth: vi.fn() }));
vi.mock("@/lib/auth/start-claim-oauth", () => ({ startClaimOAuth }));

import { UniversityMatches } from "@/components/results/university-matches";
import type { UniversityMatch } from "@/lib/matching/universities";
import type { UniversityData } from "@/lib/data/types";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

function uni(id: string, name: string): UniversityData {
  return {
    id,
    country: "australia",
    name,
    city: "Melbourne",
    rankingTier: 2,
    fieldsOffered: ["computer-science"],
    tuitionUsdPerYear: { min: 25000, max: 38000 },
    minGradePercent: 65,
    minEnglishScore: 6.5,
    source: "https://example.edu",
    lastVerified: "2026-06-02",
  };
}

const matches: UniversityMatch[] = Array.from({ length: 5 }, (_, i) => ({
  university: uni(`u${i}`, `University ${i}`),
  matchLevel: "possible",
  reason: "A realistic target.",
}));

describe("UniversityMatches", () => {
  beforeEach(() => {
    startClaimOAuth.mockReset();
  });

  it("shows the first three in full and the total count", () => {
    render(<UniversityMatches matches={matches} total={12} assessmentId={ASSESSMENT_UUID} />);
    expect(screen.getByText("University 0")).toBeInTheDocument();
    expect(screen.getByText("University 2")).toBeInTheDocument();
    expect(screen.getByText(/12 matched your profile/)).toBeInTheDocument();
  });

  it("starts Google OAuth from the locked overlay (>3 matches)", async () => {
    render(<UniversityMatches matches={matches} total={12} assessmentId={ASSESSMENT_UUID} />);
    await userEvent.click(screen.getByRole("button", { name: /Unlock all/ }));
    expect(startClaimOAuth).toHaveBeenCalledWith(ASSESSMENT_UUID);
  });

  it("cites each surfaced match's source with a verified date", () => {
    render(<UniversityMatches matches={matches} total={12} assessmentId={ASSESSMENT_UUID} />);
    // The three free cards each carry a host link + verified date; the blurred locked rows don't.
    expect(screen.getAllByRole("link", { name: /example\.edu/i })).toHaveLength(3);
    expect(screen.getAllByText(/verified 2026-06-02/i)).toHaveLength(3);
  });

  it("renders a preference chip when one is set on a surfaced match", () => {
    const chipped: UniversityMatch[] = [
      { ...matches[0]!, preferenceChip: { text: "Lower tuition" } },
      ...matches.slice(1),
    ];
    render(<UniversityMatches matches={chipped} total={12} assessmentId={ASSESSMENT_UUID} />);
    expect(screen.getByText("Lower tuition")).toBeInTheDocument();
  });

  describe("unlock gate for ≤3 matches", () => {
    const few: UniversityMatch[] = matches.slice(0, 2);

    it("still renders an unlock CTA even when there is nothing to blur", () => {
      render(<UniversityMatches matches={few} total={2} assessmentId={ASSESSMENT_UUID} />);
      // Every anonymous user gets a way in, even with no blurred rows.
      expect(screen.getByRole("button", { name: /Sign in to save your matches/ })).toBeInTheDocument();
    });

    it("starts Google OAuth from the ≤3 CTA", async () => {
      render(<UniversityMatches matches={few} total={2} assessmentId={ASSESSMENT_UUID} />);
      await userEvent.click(screen.getByRole("button", { name: /Sign in to save your matches/ }));
      expect(startClaimOAuth).toHaveBeenCalledWith(ASSESSMENT_UUID);
    });
  });

  it("disables the unlock CTA when there is no assessment id", () => {
    render(<UniversityMatches matches={matches} total={12} assessmentId={null} />);
    expect(screen.getByRole("button", { name: /Unlock all/ })).toBeDisabled();
  });
});
