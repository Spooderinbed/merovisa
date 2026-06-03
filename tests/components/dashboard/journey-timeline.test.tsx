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
});
