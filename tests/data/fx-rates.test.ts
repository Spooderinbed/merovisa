import { describe, it, expect } from "vitest";
import { toAud, FX_RATES } from "@/lib/data/policy/fx-rates";

describe("toAud — single FX source of truth", () => {
  // FX_RATES are units-per-USD (NPR 135, AUD 1.5, USD 1, NGN 1500, INR 83).
  // toAud(amount, cur) = (amount / rate[cur]) * rate[AUD], so EVERY budget→AUD
  // conversion in the app derives from ONE table — no divergent inline rates.

  it("converts USD to AUD via the AUD-per-USD rate", () => {
    expect(toAud(100, "USD")).toBeCloseTo(150); // 100 USD * 1.5 AUD/USD
  });

  it("treats AUD as identity (the rate cancels out)", () => {
    expect(toAud(150, "AUD")).toBeCloseTo(150);
  });

  it("converts NPR via the canonical rate (135/USD → AUD÷90, not the old ÷100)", () => {
    expect(toAud(13_500, "NPR")).toBeCloseTo(150); // 13500/135*1.5 = 150, i.e. NPR÷90
  });

  it("converts NGN and INR through the same table", () => {
    expect(toAud(1500, "NGN")).toBeCloseTo(1.5); // 1500/1500*1.5
    expect(toAud(8300, "INR")).toBeCloseTo(150); // 8300/83*1.5
  });

  it("passes an unmapped or null currency through as AUD (matches the prior default branch)", () => {
    expect(toAud(1000, "EUR")).toBe(1000);
    expect(toAud(1000, null)).toBe(1000);
  });

  it("derives every conversion from FX_RATES (no independent constants)", () => {
    // Property: `rate[cur]` units of any currency is 1 USD, which is audPerUsd AUD.
    const audPerUsd = FX_RATES.AUD!.value;
    for (const cur of ["USD", "NPR", "INR", "BDT", "PKR", "NGN"] as const) {
      const rate = FX_RATES[cur]!.value;
      expect(toAud(rate, cur)).toBeCloseTo(audPerUsd);
    }
  });
});
