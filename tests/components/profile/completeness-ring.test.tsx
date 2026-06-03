import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompletenessRing } from "@/components/profile/completeness-ring";

describe("CompletenessRing", () => {
  it("renders the percent label and a status breakdown", () => {
    render(<CompletenessRing pct={42} complete={5} partial={3} empty={5} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText(/5 complete/i)).toBeInTheDocument();
    expect(screen.getByText(/3 partial/i)).toBeInTheDocument();
    expect(screen.getByText(/5 not started/i)).toBeInTheDocument();
  });
});
