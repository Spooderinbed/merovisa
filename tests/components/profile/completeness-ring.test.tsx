import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompletenessRing } from "@/components/profile/completeness-ring";

describe("CompletenessRing", () => {
  it("renders the band label and a status breakdown", () => {
    render(<CompletenessRing pct={42} complete={5} partial={3} empty={5} />);
    // pct=42 → bandLabel → "Building"
    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText(/5 complete/i)).toBeInTheDocument();
    expect(screen.getByText(/3 partial/i)).toBeInTheDocument();
    expect(screen.getByText(/5 not started/i)).toBeInTheDocument();
  });

  // Audit #24: the arc snapped to its new length on every recompute. Ease the
  // stroke so completing a section grows the ring instead of jumping. The global
  // prefers-reduced-motion block collapses this to a near-instant step.
  it("eases the arc length (animates stroke-dashoffset, does not snap)", () => {
    const { container } = render(<CompletenessRing pct={42} complete={5} partial={3} empty={5} />);
    const arc = container.querySelector("circle.text-primary");
    expect(arc?.getAttribute("class")).toContain("transition-[stroke-dashoffset]");
  });
});
