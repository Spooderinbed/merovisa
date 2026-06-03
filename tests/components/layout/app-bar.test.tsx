import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppBar } from "@/components/layout/app-bar";

describe("AppBar — marketing variant", () => {
  it("renders the public nav, sign-in, and check-eligibility CTA", () => {
    render(<AppBar variant="marketing" />);
    expect(screen.getByRole("link", { name: /MyVisa/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /How it works/i })).toHaveAttribute("href", "/how");
    expect(screen.getByRole("link", { name: /Destinations/i })).toHaveAttribute("href", "/destinations");
    expect(screen.getByRole("link", { name: /Why trust us/i })).toHaveAttribute("href", "/trust");
    expect(screen.getByRole("link", { name: /Sign in/i })).toHaveAttribute("href", "/auth");
    expect(screen.getByRole("link", { name: /Check eligibility/i })).toHaveAttribute("href", "/assess");
  });
});
