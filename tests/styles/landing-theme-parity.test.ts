import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function readLandingCss(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "..", "..", "app", "(marketing)", "landing.css"), "utf8");
}

describe("landing theme parity", () => {
  const css = readLandingCss();
  it("a stamped data-theme wins over prefers-color-scheme in both directions", () => {
    // both explicit data-theme overrides exist and set --paper to their scheme value
    expect(css).toMatch(/:root\[data-theme="dark"\]\s+\.mv-landing\{[^}]*--paper:\s*#131013/);
    expect(css).toMatch(/:root\[data-theme="light"\]\s+\.mv-landing\{[^}]*--paper:\s*#f4f1ea/);
  });
  it("dark mode uses background-color, never the background shorthand, on the root", () => {
    const root = /\.mv-landing\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? "";
    expect(root).toMatch(/background-color:\s*var\(--paper\)/);
    expect(root).not.toMatch(/\bbackground:\s/);
  });
});
