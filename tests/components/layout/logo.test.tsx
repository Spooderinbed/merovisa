import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "@/components/layout/logo";

describe("Logo", () => {
  it("renders the wordmark and a graduation-cap mark, linking to / by default", () => {
    render(<Logo />);
    const link = screen.getByRole("link", { name: /MyVisa/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("accepts a custom href", () => {
    render(<Logo href="/dashboard" />);
    expect(screen.getByRole("link", { name: /MyVisa/i })).toHaveAttribute("href", "/dashboard");
  });

  it("has a calm token-timed hover affordance and preserves its structure", () => {
    const { container } = render(<Logo />);
    const link = screen.getByRole("link", { name: /MyVisa/i });
    expect(link.className).toContain("transition-opacity");
    expect(link.className).toContain("duration-fast");
    expect(link.className).toContain("ease-calm");
    expect(link.className).toContain("hover:opacity-80");
    expect(link.className).not.toMatch(/transition-all/);
    expect(link.className).not.toMatch(/duration-\d/);
    // Structure preserved: wordmark text + graduation-cap svg.
    expect(screen.getByText("MyVisa")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
