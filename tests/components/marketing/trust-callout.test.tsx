import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrustCallout } from "@/components/marketing/trust-callout";

describe("TrustCallout", () => {
  it("renders the eyebrow, headline, lead, and two CTAs linking to /assess and /destinations", () => {
    render(<TrustCallout />);
    expect(screen.getByText(/Trust is the product/i)).toBeInTheDocument();
    expect(screen.getByText(/We sit before the consultancy/i)).toBeInTheDocument();
    expect(screen.getByText(/Every recommendation shows the factors behind it/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Check your eligibility/i })).toHaveAttribute("href", "/assess");
    expect(screen.getByRole("link", { name: /Browse destinations/i })).toHaveAttribute("href", "/destinations");
  });
});
