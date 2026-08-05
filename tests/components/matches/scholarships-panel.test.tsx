import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScholarshipsPanel } from "@/components/matches/scholarships-panel";
import { selectScholarships } from "@/lib/data/select-scholarships";

// A fixed date keeps the Australia Awards window deterministic (audit F-19).
const TODAY = "2026-03-01";
const NAMES = selectScholarships(TODAY).map((row) => row.name);

/**
 * MV-162 item 12 — the reviewer read these rows as a flat list and asked for two
 * things: bold titles, and blocks that lift off the page. The lift stays inside the
 * flat vocabulary (surface tone, thin border, card radius, honest spacing) and must
 * stay quieter than the filled primary "See your program matches" card (item 11),
 * which the same reviewer praised and which this card must not flatten.
 */
describe("ScholarshipsPanel — block treatment (MV-162 item 12)", () => {
  it("bolds every scholarship title", () => {
    render(<ScholarshipsPanel today={TODAY} />);
    expect(NAMES.length).toBeGreaterThanOrEqual(4);
    for (const name of NAMES) {
      expect(screen.getByText(name).className).toMatch(/(^|\s)font-medium(\s|$)/);
    }
  });

  it("lifts each row into a discrete block — flat surface, thin border, card radius", () => {
    const { container } = render(<ScholarshipsPanel today={TODAY} />);
    const rows = Array.from(container.querySelectorAll("li"));
    expect(rows).toHaveLength(NAMES.length);
    for (const row of rows) {
      expect(row.className).toMatch(/(^|\s)bg-surface(\s|$)/);
      expect(row.className).toMatch(/(^|\s)border(\s|$)/);
      expect(row.className).toMatch(/(^|\s)border-line(\s|$)/);
      expect(row.className).toMatch(/(^|\s)rounded-md(\s|$)/);
    }
  });

  it("separates the blocks with honest spacing", () => {
    const { container } = render(<ScholarshipsPanel today={TODAY} />);
    const list = container.querySelector("ul");
    expect(list?.className).toMatch(/(^|\s)gap-4(\s|$)/);
  });

  it("stays quieter than the filled primary CTA card, and adds no shadow or gradient", () => {
    const { container } = render(<ScholarshipsPanel today={TODAY} />);
    for (const row of Array.from(container.querySelectorAll("li"))) {
      expect(row.className).not.toMatch(/bg-primary|text-on-primary/);
      expect(row.className).not.toMatch(/shadow|gradient/);
    }
  });

  it("keeps the award amount and the source line at their existing hierarchy", () => {
    render(<ScholarshipsPanel today={TODAY} />);
    // The amount is a data token: mono, small, soft — never promoted alongside the title.
    const amount = screen.getByText("Fully funded");
    expect(amount.className).toMatch(/(^|\s)font-mono(\s|$)/);
    expect(amount.className).toMatch(/(^|\s)text-small(\s|$)/);
    expect(amount.className).toMatch(/(^|\s)text-ink-soft(\s|$)/);
    expect(amount.className).not.toMatch(/font-medium/);
    // The source/verified meta line stays the quietest thing in the block.
    const source = screen.getAllByRole("link", { name: /source/i })[0];
    expect(source?.className).toMatch(/(^|\s)text-caption(\s|$)/);
    expect(source?.className).toMatch(/(^|\s)text-ink-faint(\s|$)/);
  });
});
