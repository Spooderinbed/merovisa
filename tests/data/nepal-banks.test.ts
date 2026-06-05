import { describe, it, expect } from "vitest";
import { NEPAL_BANKS } from "@/lib/data/source/nepal-banks";

describe("NEPAL_BANKS directory", () => {
  it("lists at least 20 NRB Class-A banks with unique ids", () => {
    expect(NEPAL_BANKS.length).toBeGreaterThanOrEqual(20);
    const ids = NEPAL_BANKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every bank is Class A, named, sited, and NRB-sourced", () => {
    for (const b of NEPAL_BANKS) {
      expect(b.nrbClass).toBe("A");
      expect(b.name.trim().length).toBeGreaterThan(0);
      expect(b.headOffice.trim().length).toBeGreaterThan(0);
      expect(b.source).toMatch(/^https?:\/\//);
    }
  });

  it("education-loan records carry a source and sane finite numbers", () => {
    const lenders = NEPAL_BANKS.filter((b) => b.educationLoan);
    expect(lenders.length).toBeGreaterThanOrEqual(3);
    for (const b of lenders) {
      const l = b.educationLoan!;
      expect(l.source).toMatch(/^https?:\/\//);
      for (const v of [l.minAmountNpr, l.maxAmountNpr, l.maxTenureYears, l.financingRatioPct]) {
        if (v !== undefined) expect(Number.isFinite(v)).toBe(true);
      }
      if (l.minAmountNpr !== undefined && l.maxAmountNpr !== undefined) {
        expect(l.maxAmountNpr).toBeGreaterThanOrEqual(l.minAmountNpr);
      }
      if (l.pricing?.kind === "base-spread") {
        expect(l.pricing.maxSpreadPct).toBeGreaterThanOrEqual(l.pricing.minSpreadPct);
      }
    }
  });
});
