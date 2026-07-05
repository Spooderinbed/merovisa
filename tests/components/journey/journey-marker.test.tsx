import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildJourney, type JourneySignals } from "@/lib/journey/journey";

const { usePathname } = vi.hoisted(() => ({
  usePathname: vi.fn<() => string>(() => "/matches"),
}));
vi.mock("next/navigation", () => ({ usePathname }));

import { JourneyMarker } from "@/components/journey/journey-marker";

// A signed-in user who has only completed the assessment: the honest floor.
const freshUser: JourneySignals = {
  hasAssessment: true,
  profilePct: 0,
  shortlistCount: 0,
  planEngaged: false,
  documentCount: 0,
  applyAttempted: false,
  applyGranted: false,
};

describe("JourneyMarker", () => {
  beforeEach(() => usePathname.mockReturnValue("/matches"));

  it("renders a slim link to the dashboard naming the current step and 'step N of 6'", () => {
    render(<JourneyMarker journey={buildJourney(freshUser)} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/dashboard");
    // Assessed done → the frontier advances to Profile: step 2 of 6.
    expect(link).toHaveTextContent(/Profile/);
    expect(link).toHaveTextContent(/step 2 of 6/i);
  });

  it("advances the step counter as real signals fire", () => {
    // Profile complete + a shortlist → Matches done, frontier is now Plan: step 4 of 6.
    const advanced = buildJourney({ ...freshUser, profilePct: 100, shortlistCount: 2 });
    render(<JourneyMarker journey={advanced} />);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent(/Plan/);
    expect(link).toHaveTextContent(/step 4 of 6/i);
  });

  it("exposes an honest accessible name — the journey summary plus the step count", () => {
    render(<JourneyMarker journey={buildJourney(freshUser)} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAccessibleName(/Your journey/);
    expect(link).toHaveAccessibleName(/step 2 of 6/i);
  });

  it("returns null on /dashboard, where the full rail already lives", () => {
    usePathname.mockReturnValue("/dashboard");
    const { container } = render(<JourneyMarker journey={buildJourney(freshUser)} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("carries no failure tone — this rail is wayfinding, never reach-red", () => {
    const { container } = render(<JourneyMarker journey={buildJourney(freshUser)} />);
    expect(container.querySelector(".text-reach, .bg-reach, .border-reach")).toBeNull();
  });

  it("hides the mini-dots below md but keeps the text (the progress the tab bar lacks)", () => {
    render(<JourneyMarker journey={buildJourney(freshUser)} />);
    const dots = screen.getByTestId("journey-marker-dots");
    expect(dots.className).toContain("hidden");
    expect(dots.className).toContain("md:flex");
  });
});
