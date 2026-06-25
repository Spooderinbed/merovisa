import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Group 1 accessibility + token fixes:
//   #1 a visible :focus-visible ring for keyboard users
//   #5 a prefers-reduced-motion guard
//   #10 an AA-contrast amber ink token distinct from the amber fill
// These rules must stay inside @layer base so they don't outrank Tailwind
// utilities (see globals-layering.test.ts for the unlayered-rule guard).

function readGlobalsCss(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // tests/styles
  return readFileSync(join(here, "..", "..", "app", "globals.css"), "utf8");
}

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

function layerBaseBody(css: string): string {
  const m = /@layer\s+base\s*\{/.exec(css);
  expect(m, "expected an `@layer base { … }` block").not.toBeNull();
  const start = m!.index + m![0].length - 1;
  return css.slice(start + 1, matchingBrace(css, start));
}

describe("app/globals.css accessibility rules", () => {
  it("#1 defines a :focus-visible ring using the primary token (inside @layer base)", () => {
    const body = layerBaseBody(readGlobalsCss());
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(body);
    expect(rule, ":focus-visible rule must live inside @layer base").not.toBeNull();
    const decls = rule![1];
    expect(decls).toMatch(/outline:\s*2px\s+solid\s+var\(--primary\)/);
    expect(decls).toMatch(/outline-offset:\s*2px/);
    expect(decls).toMatch(/border-radius:\s*inherit/);
  });

  it("#5 collapses motion under prefers-reduced-motion without destroying final state", () => {
    const body = layerBaseBody(readGlobalsCss());
    const mq = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?animation-duration:\s*0\.01ms[\s\S]*?transition-duration:\s*0\.01ms/;
    expect(body).toMatch(mq);
    // It must not zero opacity/visibility — only durations are touched.
    const block = /@media\s*\(prefers-reduced-motion:[\s\S]*?\n\s*\}\s*\n\s*\}/.exec(body)?.[0] ?? "";
    expect(block).not.toMatch(/opacity\s*:/);
    expect(block).not.toMatch(/visibility\s*:/);
  });

  it("#10 adds a distinct --possible-ink token mapped through @theme", () => {
    const css = readGlobalsCss();
    expect(css).toMatch(/--color-possible-ink:\s*var\(--possible-ink\)/);
    // light theme ink is the darker AA value, separate from the amber fill.
    expect(css).toMatch(/--possible-ink:\s*#8a6212/);
    expect(css).toMatch(/--possible:\s*#b07d22/);
  });
});
