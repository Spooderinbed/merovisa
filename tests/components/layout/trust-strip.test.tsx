import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrustStrip } from "@/components/layout/trust-strip";

describe("TrustStrip", () => {
  it("renders the canonical trust line", () => {
    render(<TrustStrip />);
    expect(
      screen.getByText(/No agents · no hidden commissions · we never steer you toward whoever pays us/i),
    ).toBeInTheDocument();
  });
});
