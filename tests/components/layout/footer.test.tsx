import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/layout/footer";

describe("Footer", () => {
  it("renders the three column titles and the trust + copyright lines", () => {
    render(<Footer />);
    expect(screen.getByText(/Product/i)).toBeInTheDocument();
    expect(screen.getByText(/Trust/i)).toBeInTheDocument();
    expect(screen.getByText(/Company/i)).toBeInTheDocument();
    expect(screen.getByText(/Visa rules sourced from official government sites/i)).toBeInTheDocument();
    expect(screen.getByText(/© 2026 MyVisa/i)).toBeInTheDocument();
  });

  it("renders linkable footer entries", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: /Eligibility/i })).toHaveAttribute("href", "/assess");
    expect(screen.getByRole("link", { name: /Destinations/i })).toHaveAttribute("href", "/destinations");
    expect(screen.getByRole("link", { name: /How we score/i })).toHaveAttribute("href", "/how");
    expect(screen.getByRole("link", { name: /Why no agents/i })).toHaveAttribute("href", "/trust");
  });
});
