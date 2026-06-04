import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImpactPill } from "@/components/plan/impact-pill";

describe("ImpactPill", () => {
  it("renders the right label per impact", () => {
    const { rerender } = render(<ImpactPill impact="high" />);
    expect(screen.getByText(/High impact/i)).toBeInTheDocument();
    rerender(<ImpactPill impact="medium" />);
    expect(screen.getByText(/Medium impact/i)).toBeInTheDocument();
    rerender(<ImpactPill impact="low" />);
    expect(screen.getByText(/Low impact/i)).toBeInTheDocument();
  });
});
