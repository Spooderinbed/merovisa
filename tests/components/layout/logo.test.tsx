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
});
