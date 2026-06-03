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

describe("AppBar — marketing-signed-in variant", () => {
  it("hides Sign in and shows Open dashboard CTA + UserPill", () => {
    render(<AppBar variant="marketing-signed-in" user={{ email: "a@b.com", user_metadata: {} } as never} />);
    expect(screen.queryByRole("link", { name: /Sign in/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Open dashboard/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByTestId("user-pill")).toBeInTheDocument();
  });
});

describe("AppBar — app variant", () => {
  it("renders signed-in nav and UserPill", () => {
    render(<AppBar variant="app" user={{ email: "a@b.com", user_metadata: {} } as never} />);
    expect(screen.getByRole("link", { name: /Home/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Matches/i })).toHaveAttribute("href", "/matches");
    expect(screen.getByRole("link", { name: /My plan/i })).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("link", { name: /^Profile$/i })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: /Guide/i })).toHaveAttribute("href", "/guide");
    expect(screen.getByRole("link", { name: /Destinations/i })).toHaveAttribute("href", "/destinations");
    expect(screen.getByTestId("user-pill")).toBeInTheDocument();
  });
});
