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

  it("ports the two remaining flourishes: sparkle keyframes, paper grain", () => {
    // MV-162 item 3 decluttered the hero: the hand-drawn .accent.hand marker and
    // its #hero-rough displacement filter are gone, so nothing may reference it.
    expect(css).not.toMatch(/hero-rough/);
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

  it("plan + freshness accordions open via a JS .open class, never native details[open] (so grid-rows can animate)", () => {
    // MV-117: a closed native <details> display:none's its content, so the
    // grid-template-rows 0fr→1fr ease has no prior frame to interpolate and the
    // body snaps open while the chevron rotates. Driving the expand with a .open
    // class (like .dim) keeps the detail rendered so it animates. Guard: the
    // step/freshness open + chevron selectors are class-based, and NO details[open]
    // selector drives the landing accordions any more.
    expect(css).toMatch(/\.mv-landing\s+\.step\.open\s+\.step-detail\s*\{[^}]*grid-template-rows:\s*1fr/);
    expect(css).toMatch(/\.mv-landing\s+\.fitem\.open\s+\.fdetail\s*\{[^}]*grid-template-rows:\s*1fr/);
    expect(css).toMatch(/\.mv-landing\s+\.step\.open\s+\.chev/);
    expect(css).toMatch(/\.mv-landing\s+\.fitem\.open\s+\.fchev/);
    expect(css).not.toMatch(/details\[open\]/);
  });

  it("reveal pre-reveal state is .mv-reveal.off, never .mv-reveal.hidden (Tailwind display:none collision)", () => {
    // The class MUST be .off. `.hidden` collides with Tailwind's global
    // .hidden{display:none}, which removes the element from layout so
    // IntersectionObserver can never reveal it (shipped bug: all artifacts hidden).
    expect(css).toMatch(/\.mv-reveal\.off\s*\{[^}]*opacity:\s*0/);
    expect(css).not.toMatch(/\.mv-reveal\.hidden/);
  });

  it("the sample-profile toggle spaces its two option pills with a gap (they must not touch)", () => {
    // Shipped bug: .toggle had padding but no gap, so the two full-radius pills sat
    // flush at 0px and the active plum pill was jammed against its neighbour.
    expect(css).toMatch(/\.mv-landing\s+\.toggle\s*\{[^}]*gap:\s*\d/);
  });

  it("the dimension meter .bar is display:block so its 6px height is honored (not an inline span)", () => {
    // Shipped bug: .bar is a <span> (inline by default), so height:6px was ignored
    // and the thin meter ballooned to line-box height, overlapping the next row.
    expect(css).toMatch(/\.mv-landing\s+\.bar\s*\{[^}]*display:\s*block[^}]*height:\s*6px/);
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
