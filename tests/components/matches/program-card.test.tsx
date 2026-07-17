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
    source: "https://www.monash.edu/study/courses/master-of-it",
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
  scoreSnapshot: { gradeGap: 0, englishGap: 0, bandGap: 0, tuitionGap: 0, costGap: 0 },
};

describe("ProgramCard", () => {
  it("renders verdict + program name + university", () => {
    render(<ProgramCard match={m} initialStatus={null} />);
    expect(screen.getByText(/Strong match/i)).toBeInTheDocument();
    expect(screen.getByText("Master of IT")).toBeInTheDocument();
    expect(screen.getByText(/Monash/)).toBeInTheDocument();
    expect(screen.getByText(/Grade meets minimum/i)).toBeInTheDocument();
  });

  it("reflects the persisted status in the 3-state control (Applied survives reload)", () => {
    render(<ProgramCard match={m} initialStatus="applied" />);
    expect(screen.getByRole("button", { name: "Applied" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("labels data quality from the program's dataQuality (Verified for primary)", () => {
    render(<ProgramCard match={m} initialStatus={null} />);
    expect(screen.getByText(/Verified/i)).toBeInTheDocument();
    expect(screen.getByText(/checked Jan 2026/i)).toBeInTheDocument();
  });

  it("calls a derived program estimated, regardless of its link", () => {
    const derived: MatchResult = { ...m, program: { ...m.program, dataQuality: "derived" } };
    render(<ProgramCard match={derived} initialStatus={null} />);
    expect(screen.getByText(/Estimated/i)).toBeInTheDocument();
    expect(screen.getByText(/checked Jan 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/Verified/i)).not.toBeInTheDocument();
  });

  // The link label tracks URL shape, not data quality: "Source" only when the link
  // lands on the program page; a bare provider homepage reads honestly as "Provider site".
  it("labels a deep program link 'Source', even when the figures are estimated", () => {
    const deep: MatchResult = {
      ...m,
      program: { ...m.program, dataQuality: "derived", source: "https://www.monash.edu/study/courses/master-of-it" },
    };
    render(<ProgramCard match={deep} initialStatus={null} />);
    expect(screen.getByRole("link", { name: /^Source/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Provider site/i })).not.toBeInTheDocument();
  });

  it("softens a bare provider homepage to 'Provider site', even when verified", () => {
    const bare: MatchResult = {
      ...m,
      program: { ...m.program, dataQuality: "primary", source: "https://www.monash.edu" },
    };
    render(<ProgramCard match={bare} initialStatus={null} />);
    expect(screen.getByRole("link", { name: /Provider site/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Source/i })).not.toBeInTheDocument();
  });

  it("links to the program's document checklist", () => {
    render(<ProgramCard match={m} initialStatus={null} />);
    expect(screen.getByRole("link", { name: /Document checklist/i })).toHaveAttribute("href", "/checklist/p1");
  });

  it("renders a preference chip when one is set", () => {
    render(<ProgramCard match={{ ...m, preferenceChip: { text: "Tier-1 ranked" } }} initialStatus={null} />);
    expect(screen.getByText("Tier-1 ranked")).toBeInTheDocument();
  });

  it("surfaces the program notes as a 'Good to know' caveat", () => {
    const withNotes: MatchResult = {
      ...m,
      program: { ...m.program, notes: "AHPRA registration required" },
    };
    render(<ProgramCard match={withNotes} initialStatus={null} />);
    expect(screen.getByText(/Good to know/i)).toBeInTheDocument();
    expect(screen.getByText(/AHPRA registration required/i)).toBeInTheDocument();
  });

  it("renders no caveat when the program has no notes", () => {
    render(<ProgramCard match={m} initialStatus={null} />);
    expect(screen.queryByText(/Good to know/i)).not.toBeInTheDocument();
  });

  // Honesty (MV-36): the code we hold is the PROVIDER/institution code, not the course
  // code a student needs on visa form 157A — and the register has no deep-link, so the
  // link is a search, not a direct entry. The label must say both.
  it("frames the CRICOS code as the provider code and the register link as a search", () => {
    const sydney: MatchResult = {
      ...m,
      university: { ...m.university, id: "sydney", name: "University of Sydney", city: "Sydney" },
    };
    render(<ProgramCard match={sydney} initialStatus={null} />);
    const link = screen.getByRole("link", { name: /Provider CRICOS 00026A/i });
    // Honest about the destination: a register search, not a direct deep-link to this entry.
    expect(link).toHaveTextContent(/search the register/i);
    expect(link).toHaveAttribute("href", "https://cricos.education.gov.au/");
    // Tooltip spells out the provider-vs-course-code distinction (no false 157A confidence).
    expect(link.getAttribute("title")).toMatch(/course code/i);
  });

  it("renders no CRICOS line when the university has no sourced code", () => {
    // Default fixture uses university id "u1" (unmapped) → nothing to verify.
    render(<ProgramCard match={m} initialStatus={null} />);
    expect(screen.queryByText(/CRICOS/i)).not.toBeInTheDocument();
  });

  it("surfaces the provider's DHA Nepal evidence level beside the CRICOS code", () => {
    // Sydney (00026A) is Streamlined for Nepal in the harvested map.
    const sydney: MatchResult = {
      ...m,
      university: { ...m.university, id: "sydney", name: "University of Sydney", city: "Sydney" },
    };
    render(<ProgramCard match={sydney} initialStatus={null} />);
    const link = screen.getByRole("link", { name: /Streamlined evidence/i });
    expect(link).toBeInTheDocument();
  });

  it("renders no evidence line when the university has no sourced CRICOS code", () => {
    render(<ProgramCard match={m} initialStatus={null} />);
    expect(screen.queryByText(/evidence/i)).not.toBeInTheDocument();
  });
});
