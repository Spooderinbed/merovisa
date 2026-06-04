import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgramCard } from "@/components/matches/program-card";
import type { MatchResult } from "@/lib/matches/types";

const m: MatchResult = {
  program: {
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
  university: {
    id: "u1",
    country: "AU",
    name: "Monash",
    city: "Melbourne",
    rankingTier: 1,
    source: "https://x",
    lastVerified: "2026-01-01",
    dataQuality: "primary",
  },
  verdict: "strong",
  reasons: [{ kind: "academic", text: "Grade meets minimum", positive: true }],
  scoreSnapshot: { gradeGap: 0, englishGap: 0, bandGap: 0, tuitionGap: 0 },
};

describe("ProgramCard", () => {
  it("renders verdict + program name + university", () => {
    render(<ProgramCard match={m} isShortlisted={false} />);
    expect(screen.getByText(/Strong match/i)).toBeInTheDocument();
    expect(screen.getByText("Master of IT")).toBeInTheDocument();
    expect(screen.getByText(/Monash/)).toBeInTheDocument();
    expect(screen.getByText(/Grade meets minimum/i)).toBeInTheDocument();
  });

  it("shows Shortlisted button state when isShortlisted=true", () => {
    render(<ProgramCard match={m} isShortlisted />);
    expect(screen.getByRole("button", { name: /Shortlisted/i })).toBeInTheDocument();
  });
});
