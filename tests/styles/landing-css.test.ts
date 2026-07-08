// tests/styles/landing-css.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function readLandingCss(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // tests/styles
  return readFileSync(join(here, "..", "..", "app", "(marketing)", "landing.css"), "utf8");
}

describe("app/(marketing)/landing.css", () => {
  const css = readLandingCss();

  it("scopes every rule under .mv-landing (no bare global element/type selectors leak)", () => {
    // no unscoped `body`/`html`/`*` resets; the reference's bare button{}/svg{} must be scoped
    expect(css).not.toMatch(/^\s*body\s*\{/m);
    expect(css).not.toMatch(/^\s*\*\s*\{/m);
    expect(css).toMatch(/\.mv-landing\s+\.stage/);
    expect(css).toMatch(/\.mv-landing\s+\.sparkle-cta/);
  });

  it("declares the reference token block for light, dark-media, and both data-theme directions", () => {
    expect(css).toMatch(/\.mv-landing\s*\{[^}]*--paper:\s*#f4f1ea/);
    expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*?\.mv-landing[\s\S]*?--paper:\s*#131013/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s+\.mv-landing[\s\S]*?--paper:\s*#131013/);
    expect(css).toMatch(/:root\[data-theme="light"\]\s+\.mv-landing[\s\S]*?--paper:\s*#f4f1ea/);
  });

  it("themes the hand-drawn marker token both ways (--mark light #a85b90 / dark #6a2b57)", () => {
    expect(css).toMatch(/--mark:\s*#a85b90/);
    expect(css).toMatch(/--mark:\s*#6a2b57/);
  });

  it("maps --sans/--mono to the app's loaded next/font variables (no bare fallback stack only)", () => {
    expect(css).toMatch(/--sans:\s*var\(--font-hanken-grotesk\)/);
    expect(css).toMatch(/--mono:\s*var\(--font-ibm-plex-mono\)/);
  });

  it("ports the three approved flourishes: hero marker filter, sparkle keyframes, paper grain", () => {
    expect(css).toMatch(/filter:\s*url\(#hero-rough\)/);
    expect(css).toMatch(/@keyframes\s+cta-flip/);
    expect(css).toMatch(/@keyframes\s+cta-rotate/);
    expect(css).toMatch(/feTurbulence/); // grain data-URI
    expect(css).toMatch(/mix-blend-mode:\s*multiply/);
  });

  it("uses grid-template-rows accordion transitions and a reveal + reduced-motion guard", () => {
    expect(css).toMatch(/grid-template-rows:\s*0fr/);
    expect(css).toMatch(/\.mv-reveal/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("caps width at the reference 1160px and clips horizontal overflow", () => {
    expect(css).toMatch(/--maxw:\s*1160px/);
    expect(css).toMatch(/overflow-x:\s*clip/);
  });

  it("collapses the layout at the 860px breakpoint of record (panel body → single column)", () => {
    // Reviewer nit: a dropped §3b responsive breakpoint must fail this suite.
    expect(css).toMatch(/@media\s*\(max-width:\s*860px\)/);
    expect(css).toMatch(/\.panel-body\s*\{\s*grid-template-columns:\s*1fr/);
  });
});
