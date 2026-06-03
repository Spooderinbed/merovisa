import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/(marketing)/page";

describe("Marketing homepage", () => {
  it("renders the headline, all three tiles, how-it-works, hero preview and trust callout", async () => {
    const ui = await HomePage();
    render(ui);
    expect(screen.getByText(/An honest answer before/i)).toBeInTheDocument();
    expect(screen.getByText(/Three quiet tools, no clutter/i)).toBeInTheDocument();
    expect(screen.getByText(/Eligibility & checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/An AI guide that remembers you/i)).toBeInTheDocument();
    expect(screen.getByText(/SOP coach/i)).toBeInTheDocument();
    expect(screen.getByText(/Tell us about you/i)).toBeInTheDocument();
    expect(screen.getByText(/Your feed, once you're in/i)).toBeInTheDocument();
    expect(screen.getByText(/We sit before the consultancy/i)).toBeInTheDocument();
  });

  it("renders the primary hero CTA pointing to /assess", async () => {
    const ui = await HomePage();
    render(ui);
    const ctas = screen.getAllByRole("link", { name: /Check your eligibility/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    expect(ctas[0]).toHaveAttribute("href", "/assess");
  });
});
