// tests/components/marketing/freshness-table.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FreshnessTable } from "@/components/marketing/freshness-table";

describe("FreshnessTable", () => {
  it("SSR (no effects): all five rows expose value, source, verified, and next-check at rest", () => {
    const html = renderToStaticMarkup(<FreshnessTable />);
    // value + provenance visible without interaction
    expect(html).toContain("A$29,710");
    expect(html).toContain("s.500 criteria");
    expect(html).toContain("≈ A$33,000");
    expect(html).toContain("2–4 years");
    expect(html).toContain("required");
    expect((html.match(/verified Jun 2026/g) ?? []).length).toBe(5);
    expect((html.match(/next check Jul 2026/g) ?? []).length).toBe(5);
    expect((html.match(/frow verified/g) ?? []).length).toBe(5); // dots lit at rest
  });

  it("never renders user-facing GTE", () => {
    expect(renderToStaticMarkup(<FreshnessTable />)).not.toMatch(/GTE/);
  });
});
