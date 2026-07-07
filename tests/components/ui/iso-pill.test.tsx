import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IsoPill } from "@/components/ui/iso-pill";

describe("IsoPill", () => {
  it("renders the ISO code text", () => {
    render(<IsoPill code="AU" />);
    expect(screen.getByText("AU")).toBeInTheDocument();
  });

  it("is decorative — marked aria-hidden (country name sits beside it)", () => {
    render(<IsoPill code="AU" />);
    expect(screen.getByText("AU")).toHaveAttribute("aria-hidden");
  });
});
