import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DestinationsPage from "@/app/(marketing)/destinations/page";

describe("/destinations index", () => {
  it("renders the headline, lead, and all six country cards", async () => {
    const ui = await DestinationsPage();
    render(ui);
    expect(screen.getByText(/Six countries, done well/i)).toBeInTheDocument();
    for (const name of ["Australia", "Canada", "United Kingdom", "Germany", "United States", "Ireland"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  // MV-162 item 8 — structural proof only: jsdom has no layout engine, so the grid's
  // stretch behaviour is asserted as the class contract that produces it.
  it("lets every card stretch to a common row height", async () => {
    const ui = await DestinationsPage();
    render(ui);

    const first = screen.getByRole("link", { name: /Australia/i });
    const grid = first.parentElement!;
    const utilities = grid.className.split(/\s+/).filter(Boolean);
    // Assert the bare `grid` token, not /\bgrid\b/ — that regex also matches `grid-cols-1`,
    // so it would still pass with display:grid gone and the row silently back to block layout.
    expect(utilities).toContain("grid");
    // Nothing on the container may defeat the default `stretch` alignment — check the base
    // utility of each token so a responsive variant like `md:items-center` is caught too.
    const bases = utilities.map((c) => c.split(":").pop()!);
    for (const defeat of ["items-start", "items-center", "items-end", "items-baseline"]) {
      expect(bases, "grid container").not.toContain(defeat);
    }
    // `auto-rows-fr` is what makes the two rows match each other, not just the cards within a
    // row: without it the taller row (Australia/Canada/UK) stands 56px above the shorter one,
    // measured live at 220px vs 164px — which is the raggedness the reviewer actually pointed at.
    expect(bases.filter((c) => c.startsWith("auto-rows-")), "grid container").toEqual(["auto-rows-fr"]);

    for (const name of ["Australia", "Canada", "United Kingdom", "Germany", "United States", "Ireland"]) {
      const card = screen.getByRole("link", { name: new RegExp(name, "i") });
      expect(card.className.split(/\s+/), `${name} card`).toContain("h-full");
    }
  });
});
