// tests/components/marketing/reveal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { Reveal } from "@/components/marketing/reveal";

describe("Reveal", () => {
  it("server-renders children VISIBLE (no hidden class, no matchMedia/IO during render)", () => {
    const mm = vi.spyOn(window, "matchMedia");
    const html = renderToStaticMarkup(<Reveal className="fh"><p>Sourced &amp; dated</p></Reveal>);
    expect(html).toContain("Sourced &amp; dated");
    expect(html).toMatch(/class="mv-reveal fh"/);
    expect(html).not.toMatch(/hidden/);
    expect(mm).not.toHaveBeenCalled();
    mm.mockRestore();
  });

  it("under reduced motion, stays at rest (no hidden state applied)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    render(<Reveal><p>content</p></Reveal>);
    expect(screen.getByText("content").closest(".mv-reveal")!.className).not.toMatch(/hidden|in\b/);
  });

  it("with motion allowed, the post-mount pre-reveal class is 'off', never 'hidden'", () => {
    // Regression guard for the shipped bug: the pre-reveal state was named
    // "hidden", which collides with Tailwind's global `.hidden{display:none}`.
    // display:none removes the element from layout, so IntersectionObserver can
    // NEVER report it intersecting -> the reveal is stuck hidden forever and the
    // whole section's artifact is invisible. The class must be "off" (opacity-only
    // hide that keeps the layout box observable). jsdom has no layout engine, so
    // this asserts the class contract rather than the visual outcome.
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    const observe = vi.fn();
    class IO {
      observe = observe;
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    const prev = window.IntersectionObserver;
    window.IntersectionObserver = IO as unknown as typeof IntersectionObserver;
    try {
      render(<Reveal><p>content</p></Reveal>);
      const el = screen.getByText("content").closest(".mv-reveal")!;
      expect(el.className).toMatch(/\boff\b/);
      expect(el.className).not.toMatch(/\bhidden\b/);
      expect(observe).toHaveBeenCalled();
    } finally {
      window.IntersectionObserver = prev;
    }
  });
});
