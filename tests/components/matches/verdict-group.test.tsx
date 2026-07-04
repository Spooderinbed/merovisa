import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VerdictGroup } from "@/components/matches/verdict-group";
import type { MatchResult, MatchVerdict } from "@/lib/matches/types";

/** N distinct matches in one band, named "Program 1".."Program N" so a test can
 * assert exactly which cards are mounted. */
function makeMatches(n: number, verdict: MatchVerdict): MatchResult[] {
  return Array.from({ length: n }, (_, i) => ({
    program: {
      id: `p${i + 1}`,
      universityId: "u1",
      name: `Program ${i + 1}`,
      level: "masters",
      field: "computer-science",
      tuitionMin: 40000,
      tuitionMax: 40000,
      tuitionCurrency: "AUD",
      minGrade: 65,
      minEnglish: 6.5,
      minEnglishBand: 6,
      intakes: ["feb"],
      source: "https://www.monash.edu/study/courses/x",
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
    verdict,
    reasons: [{ kind: "academic", text: "Grade meets minimum", positive: true }],
    scoreSnapshot: { gradeGap: 0, englishGap: 0, bandGap: 0, tuitionGap: 0 },
  }));
}

describe("VerdictGroup", () => {
  it("renders nothing when matches is empty", () => {
    const { container } = render(
      <VerdictGroup verdict="strong" matches={[]} statusById={new Map()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("sources its group header wording from the central VERDICT_LABELS map, not a local dict (MV-42)", () => {
    const src = readFileSync(join(process.cwd(), "components/matches/verdict-group.tsx"), "utf8");
    expect(src).toMatch(/VERDICT_LABELS/);
    // The component's own divergent HEADLINE dict is gone.
    expect(src).not.toMatch(/HEADLINE/);
  });

  it("mounts only the first `initialVisible` cards, but the header still counts them all", () => {
    render(<VerdictGroup verdict="strong" matches={makeMatches(5, "strong")} statusById={new Map()} />);
    // Header reflects the true total, not the visible count.
    expect(screen.getByRole("heading", { name: /Strong matches \(5\)/i })).toBeInTheDocument();
    expect(screen.getByText("Program 1")).toBeInTheDocument();
    expect(screen.getByText("Program 3")).toBeInTheDocument();
    // Hidden cards are not in the DOM at all (perf: not CSS-hidden).
    expect(screen.queryByText("Program 4")).not.toBeInTheDocument();
    expect(screen.queryByText("Program 5")).not.toBeInTheDocument();
  });

  it("reveals the rest on 'show more' and collapses again", () => {
    render(<VerdictGroup verdict="possible" matches={makeMatches(5, "possible")} statusById={new Map()} />);
    const toggle = screen.getByRole("button", { name: /Show 2 more possible matches/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(screen.getByText("Program 5")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: /Show fewer/i }));
    expect(screen.queryByText("Program 5")).not.toBeInTheDocument();
  });

  it("defaults a Reach band to fully collapsed when initialVisible is 0", () => {
    render(
      <VerdictGroup
        verdict="reach"
        matches={makeMatches(4, "reach")}
        statusById={new Map()}
        initialVisible={0}
      />,
    );
    // No cards up front — just the count and the reveal.
    expect(screen.queryByText("Program 1")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Show 4 reach matches/i });
    fireEvent.click(toggle);
    expect(screen.getByText("Program 1")).toBeInTheDocument();
    expect(screen.getByText("Program 4")).toBeInTheDocument();
  });

  it("shows no toggle when the band fits within initialVisible", () => {
    render(<VerdictGroup verdict="strong" matches={makeMatches(3, "strong")} statusById={new Map()} />);
    expect(screen.getByText("Program 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show/i })).not.toBeInTheDocument();
  });

  it("uses the singular 'match' when exactly one is hidden", () => {
    render(<VerdictGroup verdict="strong" matches={makeMatches(4, "strong")} statusById={new Map()} />);
    expect(screen.getByRole("button", { name: /Show 1 more strong match/i })).toBeInTheDocument();
    // Proves it's singular, not "matches".
    expect(screen.queryByRole("button", { name: /strong matches/i })).not.toBeInTheDocument();
  });
});
