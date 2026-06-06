import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PolicyBanner } from "@/components/matches/policy-banner";

describe("PolicyBanner", () => {
  it("renders AL3 + DHA $29,710 + sourced grant-rate band", () => {
    render(<PolicyBanner />);
    expect(screen.getByText(/Assessment Level/i)).toBeInTheDocument();
    expect(screen.getByText(/29,710/)).toBeInTheDocument();
    expect(screen.getByText(/76\.5.{1,3}78\.7%/)).toBeInTheDocument();
  });
});
