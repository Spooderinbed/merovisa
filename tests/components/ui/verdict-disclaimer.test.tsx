import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerdictDisclaimer, NOT_ADVICE_DISCLAIMER } from "@/components/ui/verdict-disclaimer";

describe("VerdictDisclaimer", () => {
  it("renders the not-immigration-advice boundary by default", () => {
    render(<VerdictDisclaimer />);
    expect(screen.getByText(/not immigration advice/i)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/rules-based estimate/i);
  });

  it("stays honest about the cold-start limit: estimates, not guaranteed outcomes", () => {
    // MV-08 (outcome validation) does not exist yet, so the copy must never
    // imply a verdict is a guaranteed result.
    expect(NOT_ADVICE_DISCLAIMER).toMatch(/not a guarantee/i);
    expect(NOT_ADVICE_DISCLAIMER).not.toMatch(/guaranteed/i);
  });

  it("names who actually decides and points users to a registered agent/lawyer (OMARA boundary)", () => {
    // The tightened MV-05 copy must not read as advice: it says the real
    // decision-makers decide, and routes case-specific questions to an OMARA agent.
    expect(NOT_ADVICE_DISCLAIMER).toMatch(/Department of Home Affairs/i);
    expect(NOT_ADVICE_DISCLAIMER).toMatch(/registered migration agent/i);
    expect(NOT_ADVICE_DISCLAIMER).toMatch(/OMARA/);
  });

  it("accepts a tailored message override for surface-specific framing", () => {
    render(
      <VerdictDisclaimer message="Program matches are rules-based estimates, not immigration advice." />,
    );
    expect(screen.getByText(/Program matches are rules-based estimates/i)).toBeInTheDocument();
  });
});
