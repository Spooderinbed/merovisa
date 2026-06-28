import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { JourneyRail } from "@/components/dashboard/journey-rail";
import type { JourneySignals } from "@/lib/journey/journey";

const base: JourneySignals = {
  hasAssessment: true,
  profilePct: 0,
  shortlistCount: 0,
  planEngaged: false,
  documentCount: 0,
  applyAttempted: false,
  applyGranted: false,
};

describe("JourneyRail", () => {
  it("renders a 'Your journey' panel with all six stages, each linking to its surface", () => {
    render(<JourneyRail signals={base} />);
    const region = screen.getByRole("region", { name: "Your journey" });
    for (const label of ["Assessed", "Profile", "Matches", "Plan", "Documents", "Apply"]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /Profile/ })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: /Documents/ })).toHaveAttribute("href", "/documents");
  });

  it("marks the current frontier node with aria-current='step' (a fresh user → Profile)", () => {
    render(<JourneyRail signals={base} />);
    const current = screen.getByRole("link", { name: /you are here/i });
    expect(current).toHaveAttribute("aria-current", "step");
    expect(current).toHaveAccessibleName(/Profile/);
  });

  it("includes an sr-only word-state summary naming every stage", () => {
    render(<JourneyRail signals={base} />);
    expect(screen.getByText(/^Your journey — Assessed: assessed;/)).toBeInTheDocument();
  });

  it("reflects real progress in the accessible names (Matches shortlisted, Apply granted)", () => {
    render(
      <JourneyRail
        signals={{ ...base, profilePct: 100, shortlistCount: 2, applyAttempted: true, applyGranted: true }}
      />,
    );
    expect(screen.getByRole("link", { name: /Matches: shortlisted/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Apply: granted/ })).toBeInTheDocument();
  });
});
