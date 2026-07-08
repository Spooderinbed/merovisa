// tests/components/marketing/sparkle-cta.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { SparkleCta } from "@/components/marketing/sparkle-cta";

describe("SparkleCta", () => {
  it("SSR: a real /assess link with the label; NO particles and NO Math.random during render", () => {
    const rnd = vi.spyOn(Math, "random");
    const html = renderToStaticMarkup(<SparkleCta>Check your eligibility</SparkleCta>);
    expect(html).toContain("Check your eligibility");
    expect(html).toMatch(/href="\/assess"/);
    expect(html).not.toContain('class="particle"'); // particles are seeded post-mount only
    expect(rnd).not.toHaveBeenCalled();
    rnd.mockRestore();
  });

  it("renders as an accessible link", () => {
    render(<SparkleCta>Check your eligibility</SparkleCta>);
    expect(screen.getByRole("link", { name: /Check your eligibility/i })).toHaveAttribute("href", "/assess");
  });
});
