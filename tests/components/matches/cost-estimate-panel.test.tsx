import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CostEstimatePanel } from "@/components/matches/cost-estimate-panel";

describe("CostEstimatePanel", () => {
  it("shows the DHA living-cost figure linked to its government source", () => {
    render(<CostEstimatePanel />);
    const link = screen.getByRole("link", { name: "AUD 29,710" });
    expect(link).toHaveAttribute("href", expect.stringContaining("immi.homeaffairs.gov.au"));
  });

  it("shows the student visa charge linked to its government source", () => {
    render(<CostEstimatePanel />);
    const link = screen.getByRole("link", { name: "AUD 2,000" });
    expect(link).toHaveAttribute("href", expect.stringContaining("immi.homeaffairs.gov.au"));
  });

  it("presents OSHC as a 680–949 range linked to a provider rate card", () => {
    render(<CostEstimatePanel />);
    const link = screen.getByRole("link", { name: "AUD 680–949" });
    expect(link).toHaveAttribute("href", expect.stringContaining("nib.com.au"));
  });

  it("shows the representative tuition as an estimate, NOT a clickable source", () => {
    render(<CostEstimatePanel />);
    expect(screen.getByText("AUD 44,500")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AUD 44,500" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/representative/i).length).toBeGreaterThan(0);
  });

  it("shows the indicative first-year total band", () => {
    render(<CostEstimatePanel />);
    expect(screen.getByText(/AUD 76,890–77,159/)).toBeInTheDocument();
  });

  it("lists OSHC across multiple providers — three priced, two quote-only", () => {
    render(<CostEstimatePanel />);
    // Priced providers each link their per-year figure to their own source.
    expect(screen.getByText("nib")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AUD 760" })).toHaveAttribute(
      "href",
      expect.stringContaining("ilsc.com"),
    );
    expect(screen.getByRole("link", { name: "AUD 949" })).toHaveAttribute(
      "href",
      expect.stringContaining("medibank.com.au"),
    );
    // Quote-only providers are shown honestly, never with a fabricated figure.
    expect(screen.getByText("ahm")).toBeInTheDocument();
    expect(screen.getByText("Allianz Care")).toBeInTheDocument();
    expect(screen.getAllByText(/Quote only/i)).toHaveLength(2);
  });

  it("frames the estimate honestly (single cover; providers quote individually)", () => {
    render(<CostEstimatePanel />);
    expect(screen.getByText(/First-year cost estimate/i)).toBeInTheDocument();
    expect(screen.getByText(/quote individually/i)).toBeInTheDocument();
  });
});
