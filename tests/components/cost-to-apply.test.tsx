import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CostToApply } from "@/components/results/cost-to-apply";

describe("CostToApply", () => {
  it("shows the DHA visa charge as an AUD figure linked to its government source", () => {
    render(<CostToApply />);
    const link = screen.getByRole("link", { name: /AUD 2,500/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("immi.homeaffairs.gov.au"));
  });

  it("shows the Nepal-side IELTS fee and the core-steps subtotal in NPR", () => {
    render(<CostToApply />);
    expect(screen.getByRole("link", { name: /NPR 36,000/ })).toBeInTheDocument();
    expect(screen.getByText(/NPR 57,765/)).toBeInTheDocument();
  });

  it("renders the provider application fee as a 0–150 range", () => {
    render(<CostToApply />);
    expect(screen.getByRole("link", { name: /AUD 0–150/ })).toBeInTheDocument();
  });

  it("frames the figures as application-only and avoids blending currencies", () => {
    render(<CostToApply />);
    expect(screen.getByText(/separate from tuition/i)).toBeInTheDocument();
    expect(screen.getByText(/don't blend exchange rates/i)).toBeInTheDocument();
  });
});
