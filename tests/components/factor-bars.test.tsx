import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FactorBars } from "@/components/results/factor-bars";
import type { AssessmentResult } from "@/lib/scoring/types";

const dimensions: AssessmentResult["dimensions"] = {
  academic: { value: 70, factors: [{ label: "Grade fit", influence: "positive", detail: "72% clears typical bars" }] },
  financial: { value: 60, factors: [{ label: "Education loan", influence: "neutral", detail: "Acceptable funding" }] },
  visa: { value: 55, factors: [{ label: "1-year gap", influence: "risk", detail: "Explained by work" }] },
  profileStrength: { value: 65, factors: [{ label: "Bachelor's", influence: "positive", detail: "Solid base" }] },
};

describe("FactorBars", () => {
  it("renders the four dimensions and reveals factors on click", async () => {
    render(<FactorBars dimensions={dimensions} />);
    expect(screen.getByText("Academic fit")).toBeInTheDocument();
    expect(screen.getByText("Visa case strength")).toBeInTheDocument();
    expect(screen.queryByText("72% clears typical bars")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Academic fit/ }));
    expect(screen.getByText("72% clears typical bars")).toBeInTheDocument();
  });
});
