import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UniversityMatches } from "@/components/results/university-matches";
import { GatedTeasers } from "@/components/results/gated-teasers";
import type { UniversityMatch } from "@/lib/matching/universities";
import type { UniversityData } from "@/lib/data/types";

function uni(id: string, name: string): UniversityData {
  return {
    id, country: "australia", name, city: "Melbourne", rankingTier: 2,
    fieldsOffered: ["computer-science"], tuitionUsdPerYear: { min: 25000, max: 38000 },
    minGradePercent: 65, minEnglishScore: 6.5, source: "https://e.edu", lastVerified: "2026-06-02",
  };
}
const matches: UniversityMatch[] = Array.from({ length: 5 }, (_, i) => ({
  university: uni(`u${i}`, `University ${i}`), matchLevel: "possible", reason: "A realistic target.",
}));

describe("unlocked results", () => {
  it("UniversityMatches: unlocked shows every match and no unlock button", () => {
    render(<UniversityMatches matches={matches} total={5} unlocked assessmentId="11815637-f603-4821-8dd0-d9e52560c4f6" />);
    expect(screen.getByText("University 4")).toBeInTheDocument();
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
