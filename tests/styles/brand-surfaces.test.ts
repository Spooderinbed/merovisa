import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The rebrand's off-globals surfaces: places that can't read CSS custom
// properties (global-error renders when CSS may be what failed; themeColor and
// favicon live outside the cascade entirely). Each hard-codes brand values, so
// each is a place a palette swap can silently miss — pin them to the live
// dusk-plum values and to the absence of the retired teal set.

const here = dirname(fileURLToPath(import.meta.url)); // tests/styles
const root = join(here, "..", "..");

const PLUM = {
  bg: "#f4f1ea",
  bgDark: "#141014",
  ink: "#211a20",
  inkSoft: "#5c5058",
  primary: "#6a2b57",
  onPrimary: "#fdf7fb",
};
// Retired brands must not reappear on any of these surfaces.
const STALE = ["#f6f5f1", "#0f5e54", "#4eb39f", "#111210", "#23231f", "#55554e"];

describe("global-error.tsx inline brand colours", () => {
  const src = readFileSync(join(root, "app", "global-error.tsx"), "utf8");

  it("uses the dusk-plum tokens' literal values", () => {
    expect(src).toContain(PLUM.bg);
    expect(src).toContain(PLUM.ink);
    expect(src).toContain(PLUM.inkSoft);
    expect(src).toContain(PLUM.primary);
    // CTA text is on-primary, not literal white.
    expect(src).toContain(PLUM.onPrimary);
    expect(src).not.toContain("#ffffff");
  });

  it("carries no retired teal-era hexes", () => {
    for (const hex of STALE) expect(src).not.toContain(hex);
  });
});

describe("root layout themeColor", () => {
  const src = readFileSync(join(root, "app", "layout.tsx"), "utf8");

  it("exports a viewport themeColor matching --bg in both schemes", () => {
    expect(src).toMatch(/export const viewport: Viewport/);
    expect(src).toMatch(
      new RegExp(
        `media: "\\(prefers-color-scheme: light\\)",\\s*color: "${PLUM.bg}"`
      )
    );
    expect(src).toMatch(
      new RegExp(
        `media: "\\(prefers-color-scheme: dark\\)",\\s*color: "${PLUM.bgDark}"`
      )
    );
  });
});

describe("app icons", () => {
  it("app/icon.svg exists, is dusk plum, and carries no teal", () => {
    const path = join(root, "app", "icon.svg");
    expect(existsSync(path), "app/icon.svg must exist").toBe(true);
    const svg = readFileSync(path, "utf8");
    expect(svg).toContain(PLUM.primary);
    for (const hex of STALE) expect(svg).not.toContain(hex);
  });

  it("app/favicon.ico is the regenerated PNG-in-ICO (scripts/generate-favicon.mjs)", () => {
    const buf = readFileSync(join(root, "app", "favicon.ico"));
    // ICONDIR: reserved 0, type 1 (icon), at least one image.
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1);
    expect(buf.readUInt16LE(4)).toBeGreaterThanOrEqual(1);
    // The generator embeds PNG-encoded images; the teal-era ico had none.
    expect(buf.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
  });
});
