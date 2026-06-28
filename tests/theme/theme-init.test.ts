// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme-init";

// Run the pre-hydration script string exactly as the browser would, against a real
// jsdom document, so we test the actual runtime behaviour — not a re-implementation.
function runThemeScript() {
  new Function(THEME_INIT_SCRIPT)();
}

function setPrefersDark(matches: boolean) {
  // jsdom has no matchMedia; provide one the script can read.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("dark") ? matches : false,
    media: query,
  })) as unknown as typeof window.matchMedia;
}

describe("THEME_INIT_SCRIPT (pre-hydration OS theme)", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    // @ts-expect-error — reset between cases
    delete window.matchMedia;
  });

  it("applies the dark theme when the OS prefers dark", () => {
    setPrefersDark(true);
    runThemeScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("applies the light theme when the OS prefers light", () => {
    setPrefersDark(false);
    runThemeScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("falls back to light when matchMedia is unavailable (never throws)", () => {
    // no window.matchMedia defined
    expect(() => runThemeScript()).not.toThrow();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("never throws and leaves the SSR default if matchMedia itself throws", () => {
    document.documentElement.setAttribute("data-theme", "light"); // SSR default
    window.matchMedia = vi.fn(() => {
      throw new Error("matchMedia blew up");
    }) as unknown as typeof window.matchMedia;
    expect(() => runThemeScript()).not.toThrow();
    // unchanged — the try/catch swallowed it, default stays
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
