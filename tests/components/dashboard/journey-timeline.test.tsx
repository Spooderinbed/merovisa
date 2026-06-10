import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JourneyTimeline } from "@/components/dashboard/journey-timeline";

describe("JourneyTimeline", () => {
  it("renders all 5 phase labels", () => {
    render(<JourneyTimeline currentStep="shortlist" />);
    for (const label of ["Shortlist & prep", "Apply", "Visa", "Pre-departure", "Arrival"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the currentStep as active", () => {
    render(<JourneyTimeline currentStep="apply" />);
    const active = screen.getByTestId("step-apply");
    expect(active).toHaveAttribute("data-active", "true");
  });

  it("reads as a plain progress indicator — no tappable-chip styling, nothing interactive", () => {
    render(<JourneyTimeline currentStep="shortlist" />);
    // the steps lead nowhere, so they must not borrow the bordered-tile look of the linked stat tiles
    for (const key of ["shortlist", "apply", "visa", "pre-departure", "arrival"]) {
      expect(screen.getByTestId(`step-${key}`).className).not.toMatch(/border/);
    }
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
