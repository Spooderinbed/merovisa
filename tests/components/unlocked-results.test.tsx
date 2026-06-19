import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UniversityMatches } from "@/components/results/university-matches";
import { GatedTeasers } from "@/components/results/gated-teasers";
import { makeMatchResult, TEST_PROGRAMS } from "../fixtures/catalog";
import type { MatchResult } from "@/lib/matches/types";

const matches: MatchResult[] = Array.from({ length: 5 }, (_, i) =>
  makeMatchResult({
    program: { ...TEST_PROGRAMS[0]!, id: `p${i}`, name: `Program ${i}` },
    verdict: "possible",
  }),
);

describe("unlocked results", () => {
  it("UniversityMatches: unlocked shows every match and no unlock button", () => {
    render(<UniversityMatches matches={matches} total={5} unlocked assessmentId="11815637-f603-4821-8dd0-d9e52560c4f6" />);
    expect(screen.getByText("Program 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unlock all/ })).toBeNull();
  });

  it("UniversityMatches: locked (default) hides the unlock button behind blur", () => {
    render(<UniversityMatches matches={matches} total={12} assessmentId="11815637-f603-4821-8dd0-d9e52560c4f6" />);
    expect(screen.getByRole("button", { name: /Unlock all/ })).toBeInTheDocument();
  });

  it("GatedTeasers: unlocked shows a 'coming soon' note and no blur trigger", () => {
    render(<GatedTeasers unlocked onUnlock={vi.fn()} />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
