import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/layout/footer";

describe("Footer", () => {
  it("renders the column titles and the trust + copyright lines", () => {
    render(<Footer />);
    expect(screen.getByText(/Product/i)).toBeInTheDocument();
    expect(screen.getByText(/Trust/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Every data point carries its source and a verification date\./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/© 2026 MyVisa/i)).toBeInTheDocument();
  });

  it("does not link to pages or anchors that do not exist", () => {
    render(<Footer />);
    // About / Careers / Contact have no page; broken #anchors removed
    expect(screen.queryByRole("link", { name: /About/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Careers/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Contact/i })).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toContain("#");
    }
  });

  it("makes no freshness claim we cannot keep", () => {
    render(<Footer />);
    // no daily checker exists — the honest claim is per-data-point source + verification date
    expect(screen.queryByText(/checked daily/i)).toBeNull();
  });

  it("renders linkable footer entries", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: /Eligibility/i })).toHaveAttribute("href", "/assess");
    expect(screen.getByRole("link", { name: /Destinations/i })).toHaveAttribute("href", "/destinations");
    expect(screen.getByRole("link", { name: /How we score/i })).toHaveAttribute("href", "/how");
    expect(screen.getByRole("link", { name: /Why no agents/i })).toHaveAttribute("href", "/trust");
  });
});
