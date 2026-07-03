import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// The pair policy (which fg/bg token combinations real components produce, and
// whether each is text 4.5:1 or ui 3:1) lives with the palette harness — import
// it so this guard and scripts/contrast-check.mjs can never disagree on WHAT to
// check. What differs is the subject: the harness proves candidate data; this
// test proves the tokens actually shipping in app/globals.css.
import { pairs } from "../../scripts/palette-candidates.data.mjs";

const TOKENS_PER_THEME = 23;

function readGlobalsCss(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // tests/styles
  return readFileSync(join(here, "..", "..", "app", "globals.css"), "utf8");
}

type Rgba = { r: number; g: number; b: number; a: number };

/** Parse a #rgb/#rrggbb/#rrggbbaa hex into 8-bit channels + 0..1 alpha. */
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

/** Alpha-composite a translucent source over an opaque base (float, no rounding —
    matches contrast-check.mjs exactly so marginal pairs can't flip between the two). */
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

const LITERALS: Record<string, string> = { white: "#ffffff", black: "#000000" };

// Which ambient base a translucent *-tint background composites over, per the
// pairing spec (contrast-check.mjs keeps the same map): callout tints render in
// page flow over `bg`; verdict-pill tints render on cards over `surface`.
const TINT_BASE: Record<string, "bg" | "surface"> = {
  "ink-soft|primary-tint": "bg",
  "ink-soft|possible-tint": "bg",
  "ink-soft|strong-tint": "bg",
  "strong|strong-tint": "surface",
  "possible|possible-tint": "surface",
  "possible-ink|possible-tint": "surface",
  "reach|reach-tint": "surface",
};

type Theme = "light" | "dark";

/** Extract `--token: #hex` declarations from one theme block of globals.css. */
function themeTokens(css: string, theme: Theme): Record<string, string> {
  const open =
    theme === "light"
      ? /:root,\s*\[data-theme="light"\]\s*\{/.exec(css)
      : /\[data-theme="dark"\]\s*\{/.exec(css);
  expect(open, `expected a ${theme} theme block in globals.css`).not.toBeNull();
  const start = open!.index + open![0].length;
  const body = css.slice(start, css.indexOf("}", start)).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const [, name, value] = m;
    if (name && value) tokens[name] = value;
  }
  return tokens;
}

function resolveFg(tokens: Record<string, string>, name: string): Rgba {
  if (LITERALS[name]) return parseHex(LITERALS[name]);
  const t = tokens[name];
  if (!t) throw new Error(`Unknown fg token in globals.css: --${name}`);
  return parseHex(t);
}

function resolveBg(tokens: Record<string, string>, fgName: string, bgName: string): Rgba {
  const t = tokens[bgName];
  if (!t) throw new Error(`Unknown bg token in globals.css: --${bgName}`);
  const raw = parseHex(t);
  if (raw.a >= 1) return raw;
  const baseName = TINT_BASE[`${fgName}|${bgName}`] || "bg";
  const base = tokens[baseName];
  if (!base) throw new Error(`Missing ambient base token: --${baseName}`);
  return composite(raw, parseHex(base));
}

// Permanent WCAG guard over the LIVE design tokens. scripts/contrast-check.mjs
// proved the dusk-plum candidate data; this test re-proves every shipped pair on
// every run, so a future values-only rebrand (token names frozen) cannot merge
// with a contrast regression.
describe("app/globals.css token contrast (WCAG 2.1)", () => {
  const css = readGlobalsCss();
  const themes: Theme[] = ["light", "dark"];

  it(`defines exactly ${TOKENS_PER_THEME} color tokens per theme (names frozen)`, () => {
    for (const theme of themes) {
      expect(
        Object.keys(themeTokens(css, theme)),
        `${theme} theme token count`
      ).toHaveLength(TOKENS_PER_THEME);
    }
  });

  for (const theme of themes) {
    it(`every component pair passes its threshold in ${theme} mode`, () => {
      const tokens = themeTokens(css, theme);
      const failures: string[] = [];
      for (const p of pairs) {
        const min = p.kind === "text" ? 4.5 : 3.0;
        const ratio = contrastRatio(
          resolveFg(tokens, p.fg),
          resolveBg(tokens, p.fg, p.bg)
        );
        if (ratio < min - 1e-9) {
          failures.push(`${p.fg} on ${p.bg} (${p.kind}) = ${ratio.toFixed(2)} < ${min}`);
        }
      }
      expect(failures, failures.join("; ")).toHaveLength(0);
    });
  }
});
