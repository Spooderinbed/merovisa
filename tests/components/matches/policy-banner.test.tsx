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
    expect(screen.getByText(/29,710/)).toBeInTheDocument();
    // Offshore (the from-Nepal cohort) and onshore shown as distinct, labelled
    // figures — not a bare range whose top number is the rosier onshore rate.
    expect(screen.getByText(/76\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/78\.7%/)).toBeInTheDocument();
    expect(screen.getByText(/outside Australia/i)).toBeInTheDocument();
  });
});
