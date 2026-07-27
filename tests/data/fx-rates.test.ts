import { describe, it, expect } from "vitest";
import { toAud, FX_RATES, FX_NRB_NPR_PER_AUD } from "@/lib/data/policy/fx-rates";

describe("toAud — single FX source of truth", () => {
  // FX_RATES are units-per-USD (NPR 154.52, AUD 1.4289, USD 1, NGN 1380.08, INR 94.66).
  // toAud(amount, cur) = (amount / rate[cur]) * rate[AUD], so EVERY budget→AUD
  // conversion in the app derives from ONE table — no divergent inline rates.
  // MV-132 replaced the old undated approximations (NPR 135 / AUD 1.5, which implied
  // NPR 90 per A$1 against NRB's ~108) with rates read from their publishing
  // authorities, so the expectations below are the published rates, not round numbers.

  it("converts USD to AUD via the AUD-per-USD rate", () => {
    expect(toAud(100, "USD")).toBeCloseTo(142.89); // 100 USD * 1.4289 AUD/USD
  });

  it("treats AUD as identity (the rate cancels out)", () => {
    expect(toAud(150, "AUD")).toBeCloseTo(150);
  });

  it("converts NPR at the NRB corridor rate (NPR 108.14 ≈ A$1)", () => {
    // The rate that decides a Nepali student's DHA financial-capacity factor.
    expect(toAud(FX_NRB_NPR_PER_AUD, "NPR")).toBeCloseTo(1, 3);
    expect(toAud(1_081_400, "NPR")).toBeCloseTo(10_000, 0);
  });

  it("converts NGN and INR through the same table", () => {
    expect(toAud(1380.08, "NGN")).toBeCloseTo(1.4289); // 1380.08/1380.08*1.4289
    expect(toAud(9466, "INR")).toBeCloseTo(142.89); // 9466/94.66*1.4289
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
