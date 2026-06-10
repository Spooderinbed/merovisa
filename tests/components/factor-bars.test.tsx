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

  it("renders a source attribution line for a factor that carries a source", async () => {
    const url = "https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=1196";
    const withSource: AssessmentResult["dimensions"] = {
      ...dimensions,
      financial: {
        value: 49,
        factors: [
          {
            label: "Below DHA financial-capacity requirement",
            influence: "risk",
            detail: "Short of the visa requirement.",
            source: { url, lastVerified: "2026-06-07" },
          },
        ],
      },
    };
    render(<FactorBars dimensions={withSource} />);
    await userEvent.click(screen.getByRole("button", { name: /Financial readiness/ }));
    expect(screen.getByText(/verified 2026-06-07/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "immi.homeaffairs.gov.au" });
    expect(link).toHaveAttribute("href", url);
  });

  it("omits the source line for heuristic factors", async () => {
    render(<FactorBars dimensions={dimensions} />);
    await userEvent.click(screen.getByRole("button", { name: /Academic fit/ }));
    expect(screen.queryByText(/verified/)).toBeNull();
  });

  // The scoring payload interpolates raw destination ids into factor details
  // ("threshold for australia"). The engine is off-limits, so the render seam
  // must show the proper name.
  it("humanizes raw destination ids leaked into factor detail copy", async () => {
    const leaky: AssessmentResult["dimensions"] = {
      ...dimensions,
      visa: {
        value: 55,
        factors: [
          { label: "IELTS 7.0", influence: "positive", detail: "Meets the 6.5 threshold for australia." },
        ],
      },
    };
    render(<FactorBars dimensions={leaky} />);
    await userEvent.click(screen.getByRole("button", { name: /Visa case strength/ }));
    expect(screen.getByText("Meets the 6.5 threshold for Australia.")).toBeInTheDocument();
    expect(screen.queryByText(/for australia/)).toBeNull();
  });

  // A dimension whose payload ships zero factors (e.g. profile strength for a
  // zero-gap bachelor's profile) must not pretend to open — no button, no
  // aria-expanded, nothing. The affordance is data-driven, not per-dimension.
  describe("dimension with no factors", () => {
    const withEmpty: AssessmentResult["dimensions"] = {
      ...dimensions,
      profileStrength: { value: 65, factors: [] },
    };

    it("renders the bar as a plain row with no expand affordance", () => {
      render(<FactorBars dimensions={withEmpty} />);
      expect(screen.getByText("Profile strength")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Profile strength/ })).toBeNull();
    });

    it("keeps the affordance data-driven — sibling dimensions still expand", async () => {
      render(<FactorBars dimensions={withEmpty} />);
      await userEvent.click(screen.getByRole("button", { name: /Academic fit/ }));
      expect(screen.getByText("72% clears typical bars")).toBeInTheDocument();
    });
  });
});
