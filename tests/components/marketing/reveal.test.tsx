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
});
