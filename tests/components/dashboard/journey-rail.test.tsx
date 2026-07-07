import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JourneyRail } from "@/components/dashboard/journey-rail";
import type { JourneySignals } from "@/lib/journey/journey";

function signals(over: Partial<JourneySignals> = {}): JourneySignals {
  return {
    hasAssessment: true,
    profilePct: 40,
    shortlistCount: 0,
    planEngaged: false,
    documentCount: 0,
    applyAttempted: false,
    applyGranted: false,
    ...over,
  };
}

describe("JourneyRail", () => {
  it("renders a labelled 'Your journey' region", () => {
    render(<JourneyRail signals={signals()} />);
    expect(screen.getByRole("region", { name: "Your journey" })).toBeInTheDocument();
  });

  it("marks the frontier stage as the current step", () => {
    // Assessed done + profile in progress → Profile is "you are here".
    render(<JourneyRail signals={signals()} />);
    const current = screen.getByRole("link", { current: "step" });
    expect(current).toHaveAccessibleName(/Profile/);
    expect(current).toHaveAccessibleName(/you are here/);
  });

  it("reveals the rail on mount with a single calm entrance", () => {
    render(<JourneyRail signals={signals()} />);
    expect(screen.getByRole("region", { name: "Your journey" }).className).toContain(
      "animate-rise",
    );
  });

  it("animates dot state changes calmly with motion tokens (no raw duration)", () => {
    const { container } = render(<JourneyRail signals={signals()} />);
    const dot = container.querySelector("li span[aria-hidden]");
    expect(dot?.className).toContain("transition-");
    expect(dot?.className).toContain("duration-medium");
    expect(dot?.className).toContain("ease-calm");
    expect(dot?.className ?? "").not.toMatch(/duration-\[/);
  });
});
