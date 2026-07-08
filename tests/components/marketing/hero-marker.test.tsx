import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroMarker } from "@/components/marketing/hero-marker";

describe("HeroMarker", () => {
  it("wraps its children in the .accent.hand marker span (no client JS)", () => {
    const html = renderToStaticMarkup(<HeroMarker>pay anyone.</HeroMarker>);
    expect(html).toContain("pay anyone.");
    expect(html).toMatch(/class="accent hand"/);
  });
});
