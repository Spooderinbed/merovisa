import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { startClaimOAuth } = vi.hoisted(() => ({ startClaimOAuth: vi.fn() }));
vi.mock("@/lib/auth/start-claim-oauth", () => ({ startClaimOAuth }));

import { UniversityMatches } from "@/components/results/university-matches";
import { makeMatchResult, TEST_PROGRAMS } from "../fixtures/catalog";
import type { MatchResult } from "@/lib/matches/types";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

function match(i: number, overrides: Partial<MatchResult> = {}): MatchResult {
  return makeMatchResult({
    program: {
      ...TEST_PROGRAMS[0]!,
      id: `p${i}`,
      name: `Program ${i}`,
      source: "https://example.edu/p",
      lastVerified: "2026-06-02",
    },
    verdict: "possible",
    reasons: [{ kind: "academic", text: "A realistic target.", positive: true }],
    ...overrides,
  });
}

const matches: MatchResult[] = Array.from({ length: 5 }, (_, i) => match(i));

describe("UniversityMatches", () => {
  beforeEach(() => {
    startClaimOAuth.mockReset();
  });

  it("shows the first three in full and the total count", () => {
    render(<UniversityMatches matches={matches} total={12} assessmentId={ASSESSMENT_UUID} />);
    expect(screen.getByText("Program 0")).toBeInTheDocument();
    expect(screen.getByText("Program 2")).toBeInTheDocument();
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
    const chipped: MatchResult[] = [match(0, { preferenceChip: { text: "Lower tuition" } }), ...matches.slice(1)];
    render(<UniversityMatches matches={chipped} total={12} assessmentId={ASSESSMENT_UUID} />);
    expect(screen.getByText("Lower tuition")).toBeInTheDocument();
  });

  describe("program notes (Good to know) — parity with the dashboard ProgramCard", () => {
    it("surfaces a program's caveat note (e.g. AHPRA) on a free match card", () => {
      const noted: MatchResult[] = [
        match(0, {
          program: {
            ...TEST_PROGRAMS[0]!,
            id: "p0",
            name: "Program 0",
            source: "https://example.edu/p",
            lastVerified: "2026-06-02",
            notes: "AHPRA registration required",
          },
        }),
        ...matches.slice(1),
      ];
      render(<UniversityMatches matches={noted} total={12} assessmentId={ASSESSMENT_UUID} />);
      expect(screen.getByText("Good to know")).toBeInTheDocument();
      expect(screen.getByText("AHPRA registration required")).toBeInTheDocument();
    });

    it("omits the note block when the program has no notes", () => {
      // The default matches array carries notes: null on every surfaced program.
      render(<UniversityMatches matches={matches} total={12} assessmentId={ASSESSMENT_UUID} />);
      expect(screen.queryByText("Good to know")).not.toBeInTheDocument();
    });
  });

  describe("unlock gate for ≤3 matches", () => {
    const few: MatchResult[] = matches.slice(0, 2);

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
