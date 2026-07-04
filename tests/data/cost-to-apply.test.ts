import { describe, it, expect } from "vitest";
import { selectCostToApply } from "@/lib/data/cost-to-apply";

describe("selectCostToApply", () => {
  const breakdown = selectCostToApply();
  const nepal = breakdown.groups.find((g) => g.currency === "NPR");
  const australia = breakdown.groups.find((g) => g.currency === "AUD");

  it("groups costs by where they're paid — Nepal (NPR) and Australia (AUD)", () => {
    expect(nepal).toBeDefined();
    expect(australia).toBeDefined();
  });

  it("anchors the Australia side on the DHA student-visa charge (AUD 2,500), sourced to immi.homeaffairs.gov.au", () => {
    const visa = australia!.lines.find((l) => /visa charge/i.test(l.label));
    expect(visa?.amount).toBe(2_500);
    expect(visa?.source).toMatch(/^https:\/\/immi\.homeaffairs\.gov\.au/);
  });

  it("includes the IELTS sitting fee (NPR 36,000) on the Nepal side, sourced to the test provider", () => {
    const ielts = nepal!.lines.find((l) => /IELTS/i.test(l.label));
    expect(ielts?.amount).toBe(36_000);
    expect(ielts?.source).toMatch(/ielts\.org/);
  });

  it("carries the provider application fee as a 0–150 range (varies; often waived)", () => {
    const provider = australia!.lines.find((l) => /application fee/i.test(l.label));
    expect(provider?.amount).toBe(0);
    expect(provider?.amountMax).toBe(150);
  });

  it("subtotals the Nepal core steps to the exact sum of its line items", () => {
    const sum = nepal!.lines.reduce((total, l) => total + l.amount, 0);
    expect(nepal!.subtotal).toBe(sum);
    expect(nepal!.subtotal).toBe(57_765);
  });

  it("does not invent a blended cross-currency total (FX is intentionally out of scope)", () => {
    // Each group stays in its own currency; there is no single grand total.
    expect(australia!.subtotal).toBeUndefined();
    expect(new Set(breakdown.groups.map((g) => g.currency)).size).toBe(breakdown.groups.length);
  });

  it("every line carries a source URL and a verified date for traceability", () => {
    for (const group of breakdown.groups) {
      for (const line of group.lines) {
        expect(line.source, line.label).toMatch(/^https?:\/\//);
        expect(line.lastVerified, line.label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});
