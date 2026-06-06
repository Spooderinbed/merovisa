import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PolicyBanner } from "@/components/matches/policy-banner";

describe("PolicyBanner", () => {
  it("renders AL3 + DHA $29,710 + cohort-labelled grant rate (offshore led)", () => {
    render(<PolicyBanner />);
    expect(screen.getByText(/Assessment Level/i)).toBeInTheDocument();
    expect(screen.getByText(/29,710/)).toBeInTheDocument();
    // Offshore (the from-Nepal cohort) and onshore shown as distinct, labelled
    // figures — not a bare range whose top number is the rosier onshore rate.
    expect(screen.getByText(/76\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/78\.7%/)).toBeInTheDocument();
    expect(screen.getByText(/outside Australia/i)).toBeInTheDocument();
  });
});
