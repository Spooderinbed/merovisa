import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PolicyBanner } from "@/components/matches/policy-banner";

describe("PolicyBanner", () => {
  it("renders the scrutiny line + DHA $29,710 + cohort-labelled grant rate (offshore led)", () => {
    render(<PolicyBanner />);
    // Read-through F2 (Option B): the old "Assessment Level L3" line was unsourced —
    // the banner now claims only what the ledger can ground, in our-recommendation voice.
    expect(screen.getByText(/heightened financial-evidence scrutiny/i)).toBeInTheDocument();
    expect(screen.queryByText(/Assessment Level/i)).not.toBeInTheDocument();
    // F2-A closure: the stronger unsourced wording is permanently rejected.
    expect(screen.queryByText(/case officer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AUD 5,000/)).not.toBeInTheDocument();
    expect(screen.getByText(/29,710/)).toBeInTheDocument();
    // Read-through F9: 29,710 is the living-cost component, not the whole financial requirement.
    expect(screen.getByText(/living-cost requirement/i)).toBeInTheDocument();
    expect(screen.getByText(/travel and tuition evidence come on top/i)).toBeInTheDocument();
    expect(screen.queryByText(/financial floor/i)).not.toBeInTheDocument();
    // Offshore (the from-Nepal cohort) and onshore shown as distinct, labelled
    // figures — not a bare range whose top number is the rosier onshore rate.
    expect(screen.getByText(/76\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/78\.7%/)).toBeInTheDocument();
    expect(screen.getByText(/outside Australia/i)).toBeInTheDocument();
  });

  it("frames the 6-month seasoning as our recommendation, not a DHA rule", () => {
    render(<PolicyBanner />);
    // The duration is our guidance (DHA publishes none), so it must read as a recommendation.
    expect(
      screen.getByText(/we recommend planning for around 6 months of bank seasoning/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/plan for 6 months of/i)).not.toBeInTheDocument();
  });

  it("links each headline figure to its DHA source with a verified date", () => {
    render(<PolicyBanner />);
    // Living-cost figure → the DHA capacity article; grant rate → the DHA program report.
    expect(screen.getByRole("link", { name: /immi\.homeaffairs\.gov\.au/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /www\.homeaffairs\.gov\.au/i })).toBeInTheDocument();
    // Both carry their last-verified date so the numbers don't read as magically authoritative.
    expect(screen.getAllByText(/verified 2026-06-07/i).length).toBeGreaterThanOrEqual(2);
  });

  it("renders the gov Document Checklist Tool pointer (F2-A a1, C.146)", () => {
    render(<PolicyBanner />);
    expect(
      screen.getByText(/shows exactly what to attach for your passport country and provider/i),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Document Checklist Tool/i });
    expect(link).toHaveAttribute(
      "href",
      "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool",
    );
  });
});
