import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressDots } from "@/components/ui/progress-dots";

describe("ProgressDots", () => {
  it("exposes progress via aria attributes", () => {
    render(<ProgressDots total={8} current={2} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
  });

  it("animates only named properties, never transition-all (Motion v2 ADR)", () => {
    const { container } = render(<ProgressDots total={4} current={1} />);
    const dot = container.querySelector("[role='progressbar'] > span");
    expect(dot?.getAttribute("class")).toContain("transition-[width,background-color]");
    expect(dot?.getAttribute("class")).not.toContain("transition-all");
  });
});
