import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MV-106 ratchet (applies the type-scale ADR, docs/design/2026-07-03-type-scale-adr.md).
 *
 * Font sizes used to be baked as Tailwind arbitrary values — `text-[15px]`,
 * `text-[11.5px]`, … — 414 occurrences across ~109 files, 19 distinct pixel
 * values jittering within a 16px range. They now render through the named
 * 9-step scale (`text-caption` … `text-display`) defined once in `@theme`.
 * A new `text-[Npx]` is drift back to the sprawl the scale exists to prevent.
 *
 * The scale names ROLES, not literals, so the anchor value is a one-line
 * `@theme` edit (e.g. nudging `--text-caption` from 11px) with zero call-site
 * churn — that is the whole point of tokenising.
 */

const SCALE = [
  "caption",
  "small",
  "meta",
  "body",
  "control",
  "lead",
  "title",
  "headline",
  "display",
] as const;

// Arbitrary pixel font-size only (`text-[15px]`, `text-[11.5px]`). Non-px
// arbitraries (`text-[color]`, `text-[var(--x)]`, `text-[length:…]`) are a
// different concern and stay legal.
const ARBITRARY_TEXT_PX = /text-\[\d+(?:\.\d+)?px\]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("type scale ratchet (MV-106)", () => {
  it("defines the 9-step scale as @theme tokens in globals.css", () => {
    const css = readFileSync(join("app", "globals.css"), "utf8");
    for (const step of SCALE) {
      expect(css, `missing --text-${step}`).toContain(`--text-${step}:`);
    }
  });

  it("no component or route hand-rolls an arbitrary text-[Npx] size — use the scale", () => {
    const offenders: string[] = [];
    for (const root of ["components", "app"]) {
      for (const file of sourceFiles(root)) {
        const hits = readFileSync(file, "utf8").match(ARBITRARY_TEXT_PX);
        if (hits) {
          offenders.push(`${file.replace(/\\/g, "/")}: ${[...new Set(hits)].join(", ")}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
