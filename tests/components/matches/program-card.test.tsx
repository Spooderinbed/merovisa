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

  it("labels a verified (primary) program and cites the source", () => {
    render(<ProgramCard match={m} isShortlisted={false} />);
    expect(screen.getByText(/Verified/i)).toBeInTheDocument();
    expect(screen.getByText(/checked Jan 2026/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Source/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Provider site/i })).not.toBeInTheDocument();
  });

  it("labels a derived program as estimated and softens the link to the provider site", () => {
    const derived: MatchResult = { ...m, program: { ...m.program, dataQuality: "derived" } };
    render(<ProgramCard match={derived} isShortlisted={false} />);
    expect(screen.getByText(/Estimated/i)).toBeInTheDocument();
    expect(screen.getByText(/checked Jan 2026/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Provider site/i })).toBeInTheDocument();
    expect(screen.queryByText(/Verified/i)).not.toBeInTheDocument();
  });

  it("links to the program's document checklist", () => {
    render(<ProgramCard match={m} isShortlisted={false} />);
    expect(screen.getByRole("link", { name: /Document checklist/i })).toHaveAttribute("href", "/checklist/p1");
  });
});
