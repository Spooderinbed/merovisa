import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UniversityMatches } from "@/components/results/university-matches";
import type { UniversityMatch } from "@/lib/matching/universities";
import type { UniversityData } from "@/lib/data/types";

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
  it("shows the first three in full and the total count", () => {
    render(<UniversityMatches matches={matches} total={12} onUnlock={vi.fn()} />);
    expect(screen.getByText("University 0")).toBeInTheDocument();
    expect(screen.getByText("University 2")).toBeInTheDocument();
    expect(screen.getByText(/12 matched your profile/)).toBeInTheDocument();
  });

  it("fires onUnlock from the locked overlay", async () => {
    const onUnlock = vi.fn();
    render(<UniversityMatches matches={matches} total={12} onUnlock={onUnlock} />);
    await userEvent.click(screen.getByRole("button", { name: /Unlock all/ }));
    expect(onUnlock).toHaveBeenCalledOnce();
  });

  it("renders a preference chip when one is set on a surfaced match", () => {
    const chipped: UniversityMatch[] = [
      { ...matches[0]!, preferenceChip: { text: "Lower tuition" } },
      ...matches.slice(1),
    ];
    render(<UniversityMatches matches={chipped} total={12} onUnlock={vi.fn()} />);
    expect(screen.getByText("Lower tuition")).toBeInTheDocument();
  });
});
