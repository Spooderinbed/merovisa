import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccuracyMeter } from "@/components/results/accuracy-meter";
import type { ProfileAccuracy } from "@/lib/results/accuracy";

const basic: ProfileAccuracy = {
  completeness: 25,
  level: "Basic",
  suggestions: [
    { id: "transcript", label: "Upload your transcript", gain: "keep it on file" },
  ],
};

describe("AccuracyMeter confidence honesty (audit fix #5)", () => {
  it("renders a qualitative confidence label, not a raw percentage number", () => {
    const { container } = render(<AccuracyMeter accuracy={basic} />);

    // A worded confidence level reads instead of the bare level token.
    expect(screen.getByText(/Basic confidence/i)).toBeInTheDocument();

    // No raw percentage (e.g. "25%") is shown to the user — product rule: never
    // surface numeric scores. The width style on the bar is layout, not text;
    // assert no visible text node carries a "%" numeral.
    expect(container.textContent ?? "").not.toMatch(/\d+\s*%/);
    expect(screen.queryByText(/25\s*%/)).toBeNull();
  });

  it("words each level the same way (Verified, Complete)", () => {
    render(
      <AccuracyMeter accuracy={{ ...basic, completeness: 80, level: "Complete" }} />,
    );
    expect(screen.getByText(/Complete confidence/i)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*%/)).toBeNull();
  });

  it("still shows the section heading and suggestions", () => {
    render(<AccuracyMeter accuracy={basic} />);
    expect(screen.getByText(/Profile accuracy/i)).toBeInTheDocument();
    expect(screen.getByText(/Upload your transcript/i)).toBeInTheDocument();
  });
});
