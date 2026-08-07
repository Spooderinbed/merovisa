import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DestinationsPage from "@/app/(marketing)/destinations/page";
import { MARKETING_DESTINATIONS } from "@/lib/marketing/destinations";

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

/**
 * "Six countries researched" -> 6. NaN when the sentence does not open with a number
 * word, and NaN for a missing sentence too — a headline collapsed back to one line has
 * to read as a count mismatch, not crash the guard on `undefined.trim()`.
 */
function statedCount(sentence: string | undefined): number {
  const first = (sentence ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const n = NUMBER_WORDS.indexOf(first);
  return n === -1 ? NaN : n;
}

/** The h1 is two block spans, so its textContent reads as two "."-terminated sentences. */
function headlineSentences(): string[] {
  return (screen.getByRole("heading", { level: 1 }).textContent ?? "")
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("/destinations index", () => {
  it("renders the headline, lead, and all six country cards", async () => {
    const ui = await DestinationsPage();
    render(ui);
    expect(screen.getByText(/Six countries researched/i)).toBeInTheDocument();
    expect(screen.getByText(/One corridor we assess end-to-end/i)).toBeInTheDocument();
    for (const name of ["Australia", "Canada", "United Kingdom", "Germany", "United States", "Ireland"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  // MV-134 (audit C-11) — the page lists six countries but only assesses one corridor.
  // The lead has to say so, or the grid of six reads as six supported corridors and the
  // student researching Canada invests trust in a dead end.
  it("says in the lead which single corridor it actually assesses", async () => {
    const ui = await DestinationsPage();
    render(ui);
    expect(screen.getByText(/today we only assess your standing for Nepal/i)).toBeInTheDocument();
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

// MV-134 (audit C-11) rot guard. "Six countries" and "one corridor" are hardcoded counts;
// they become the same class of live false claim this card exists to remove the day a
// seventh destination lands in MARKETING_DESTINATIONS or a second corridor flips
// `supported: true`. So read the counts back out of the rendered headline and compare
// them to the data instead of hardcoding 6 and 1 a second time in the test.
describe("/destinations headline counts stay true to the data", () => {
  it("states the real destination total and the real supported-corridor count", async () => {
    const ui = await DestinationsPage();
    render(ui);
    const [total, corridors] = headlineSentences();
    expect(statedCount(total), "headline destination total").toBe(MARKETING_DESTINATIONS.length);
    expect(statedCount(corridors), "headline supported-corridor count").toBe(
      MARKETING_DESTINATIONS.filter((d) => d.supported).length,
    );
  });

  it("parses the number word rather than passing vacuously", () => {
    expect(statedCount("Six countries researched")).toBe(6);
    expect(statedCount("Seven countries researched")).toBe(7);
    expect(statedCount("One corridor we assess end-to-end")).toBe(1);
    expect(statedCount("Two corridors we assess end-to-end")).toBe(2);
    expect(statedCount("Countries researched")).toBeNaN();
    expect(statedCount(undefined)).toBeNaN();
  });
});
