import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Corridor theming guard (MV-96 = overhaul spec MV-91).
 *
 * The corridor layer may override ACCENT tokens only — the base palette stays
 * globally neutral, and marketing surfaces must never carry the corridor
 * attribute (the brand must not read as "a Nepali website" pre-onboarding).
 * WCAG math matches tests/styles/token-contrast.test.ts / contrast-check.mjs.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readGlobalsCss(): string {
  return readFileSync(join(ROOT, "app", "globals.css"), "utf8");
}

type Rgba = { r: number; g: number; b: number; a: number };

function parseHex(hex: string): Rgba {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 6) h += "ff";
  if (h.length !== 8) throw new Error(`Bad hex: ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: parseInt(h.slice(6, 8), 16) / 255,
  };
}

function composite(src: Rgba, base: Rgba): Rgba {
  const a = src.a;
  return {
    r: src.r * a + base.r * (1 - a),
    g: src.g * a + base.g * (1 - a),
    b: src.b * a + base.b * (1 - a),
    a: 1,
  };
}

function linearize(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(fg: Rgba, bg: Rgba): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

type Theme = "light" | "dark";

/** Body of the np-au corridor override block for one theme. */
function corridorBlock(css: string, theme: Theme): string {
  const re =
    theme === "light"
      ? /(?<=^|\n)\[data-corridor="np-au"\]\s*\{/
      : /\[data-theme="dark"\]\s+\[data-corridor="np-au"\]\s*\{/;
  const open = re.exec(css);
  expect(open, `expected a ${theme} np-au corridor block in globals.css`).not.toBeNull();
  const start = open!.index + open![0].length;
  return css.slice(start, css.indexOf("}", start)).replace(/\/\*[\s\S]*?\*\//g, "");
}

function blockTokens(body: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const [, name, value] = m;
    if (name && value) tokens[name] = value;
  }
  return tokens;
}

/** Base theme tokens (same extraction as token-contrast.test.ts). */
function themeTokens(css: string, theme: Theme): Record<string, string> {
  const open =
    theme === "light"
      ? /:root,\s*\[data-theme="light"\]\s*\{/.exec(css)
      : /(?<!\]\s)\[data-theme="dark"\]\s*\{/.exec(css);
  expect(open, `expected a ${theme} theme block`).not.toBeNull();
  const start = open!.index + open![0].length;
  return blockTokens(css.slice(start, css.indexOf("}", start)));
}

describe("corridor token overrides (globals.css)", () => {
  const css = readGlobalsCss();
  const themes: Theme[] = ["light", "dark"];

  it("overrides ONLY accent tokens — the base palette stays global", () => {
    for (const theme of themes) {
      const names = Object.keys(blockTokens(corridorBlock(css, theme))).sort();
      expect(names, `${theme} corridor block token names`).toEqual(["accent", "accent-tint"]);
    }
  });

  for (const theme of themes) {
    it(`np-au accent passes WCAG AA in ${theme} mode`, () => {
      const base = themeTokens(css, theme);
      const corridor = blockTokens(corridorBlock(css, theme));
      const accent = parseHex(corridor["accent"]!);
      const tint = parseHex(corridor["accent-tint"]!);
      const bg = parseHex(base["bg"]!);
      const surface = parseHex(base["surface"]!);
      const ink = parseHex(base["ink"]!);
      // Accent as text (4.5:1 — the stricter bar, so UI 3:1 is implied) on both
      // ambient bases, ink over the tint fill, and accent-on-own-tint (pill shape).
      expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(accent, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink, composite(tint, bg))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(accent, composite(tint, surface))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("corridor attribute stays off marketing surfaces", () => {
  it("no marketing source references data-corridor", () => {
    const dirs = [join(ROOT, "app", "(marketing)"), join(ROOT, "components", "marketing")];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.(ts|tsx|css)$/.test(entry.name)) continue;
        const path = join(entry.parentPath, entry.name);
        if (readFileSync(path, "utf8").includes("data-corridor")) offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });
});
