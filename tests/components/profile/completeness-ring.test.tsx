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
    const cls = arc?.getAttribute("class") ?? "";
    // MV-99: the re-tint keeps the design token (text-primary), and the spec
    // explicitly says keep the dashoffset transition — tokenised, no raw duration.
    expect(cls).toContain("text-primary");
    expect(cls).toContain("transition-[stroke-dashoffset]");
    expect(cls).toContain("duration-slower");
    expect(cls).not.toMatch(/duration-\d/);
    expect(cls).not.toMatch(/duration-\[/);
  });

  // MV-99: the completeness card is a stable page-shell root that mounts once on
  // navigation, so it gets the single calm entrance reveal — mirroring the
  // dashboard slice (JourneyRail / Greeting). One reveal per container, never a
  // per-child stagger (which would flash under prefers-reduced-motion).
  it("reveals on mount with a single calm entrance", () => {
    const { container } = render(<CompletenessRing pct={42} complete={5} partial={3} empty={5} />);
    const shell = container.firstElementChild;
    expect(shell?.className).toContain("animate-rise");
  });
});
