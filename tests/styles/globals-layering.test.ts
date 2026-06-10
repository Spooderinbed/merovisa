import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Unlayered CSS outranks EVERY @layer rule, and Tailwind v4 puts all
// utilities in @layer utilities. So a top-level `p { margin: 0 }` in
// globals.css silently disables every margin utility on every <p> app-wide
// (this bit twice on 2026-06-10: first an `a { color: inherit }` rule, then
// the remaining element resets). Guard: element/universal/pseudo-element
// selector rules in globals.css must live inside @layer base. Token blocks
// (`:root`, `[data-theme=…]`) stay unlayered on purpose — custom-property
// assignments don't compete with utilities.

function readGlobalsCss(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // tests/styles
  return readFileSync(join(here, "..", "..", "app", "globals.css"), "utf8");
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, " ");

/** Find the index of the `}` matching the `{` at openBrace. */
function matchingBrace(css: string, openBrace: number): number {
  let depth = 0;
  for (let i = openBrace; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

// At-rules whose contents are exempt: @layer is the fix itself; @theme holds
// design tokens; @keyframes bodies (`from`/`to`) are not element selectors.
const EXEMPT_AT_RULE = /^@(layer|theme|keyframes|font-face|property)\b/;

/**
 * Walk top-level statements (descending into conditional groups like @media /
 * @supports, where rules are still unlayered) and collect the selector of
 * every style rule found outside an exempt at-rule.
 */
function collectUnlayeredSelectors(css: string, out: string[] = []): string[] {
  let i = 0;
  while (i < css.length) {
    const brace = css.indexOf("{", i);
    const semi = css.indexOf(";", i);
    if (brace === -1) break;
    if (semi !== -1 && semi < brace) {
      i = semi + 1; // statement at-rule, e.g. @import "tailwindcss";
      continue;
    }
    const prelude = css.slice(i, brace).trim();
    const close = matchingBrace(css, brace);
    if (prelude.startsWith("@")) {
      if (!EXEMPT_AT_RULE.test(prelude)) {
        collectUnlayeredSelectors(css.slice(brace + 1, close), out);
      }
    } else {
      out.push(prelude.replace(/\s+/g, " "));
    }
    i = close + 1;
  }
  return out;
}

/**
 * True when a single compound selector is anchored on a bare element,
 * the universal selector, or a bare pseudo-element — i.e. a reset that an
 * unlayered position would let beat every Tailwind utility on that element.
 * Selectors anchored on a class / id / attribute / single-colon pseudo-class
 * (`.x`, `#x`, `[data-theme]`, `:root`) are fine unlayered.
 */
function isElementAnchored(selector: string): boolean {
  return /^(\*|[a-zA-Z][a-zA-Z0-9-]*|::[a-zA-Z-]+)/.test(selector);
}

describe("app/globals.css cascade layering", () => {
  it("has no unlayered element/universal/pseudo-element selector rules", () => {
    const offenders = collectUnlayeredSelectors(stripComments(readGlobalsCss()))
      .flatMap((selectorList) => selectorList.split(",").map((s) => s.trim()))
      .filter(isElementAnchored);
    expect(
      offenders,
      `Unlayered element-selector rule(s) found in app/globals.css: ${offenders.join(" | ")}. ` +
        "Unlayered rules beat every Tailwind layer and silently disable utilities — " +
        "move element resets inside `@layer base { … }`.",
    ).toEqual([]);
  });

  it("keeps the element resets inside @layer base (not deleted)", () => {
    const css = stripComments(readGlobalsCss());
    const layerBase = /@layer\s+base\s*\{/.exec(css);
    expect(layerBase, "expected an `@layer base { … }` block in app/globals.css").not.toBeNull();
    const start = layerBase!.index + layerBase![0].length - 1;
    const body = css.slice(start + 1, matchingBrace(css, start));
    // Spot-check the resets actually moved into the layer rather than vanishing.
    expect(body).toContain("box-sizing: border-box");
    expect(body).toContain("::selection");
    expect(body).toContain("text-wrap: balance");
  });
});
