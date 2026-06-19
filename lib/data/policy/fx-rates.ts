import type { Sourced } from "@/lib/data/types";
import type { Currency } from "@/lib/scoring/types";

/**
 * FX rates as units of each currency per 1 USD — `toUsd` divides a budget by
 * these (mirrors lib/scoring/financial.ts). USD = 1 (identity). Modelled as a
 * `Partial` map so an unmapped currency is legible at the type level as
 * "no rate → passthrough" (toUsd returns the amount unchanged), which the
 * characterization golden `unknown-currency-passthrough` pins.
 *
 * Static approximations, not a live feed — tagged `internal-heuristic` with a
 * short-lived `lastVerified` so the staleness report flags them for re-check.
 */
const fx = (value: number, note: string): Sourced<number> => ({
  value,
  provenance: { findingRefs: [], source: "internal-heuristic", lastVerified: "2026-06-02", note },
});

export const FX_RATES: Partial<Record<Currency, Sourced<number>>> = {
  USD: fx(1, "USD identity"),
  NPR: fx(135, "Nepali rupee per USD (approx)"),
  AUD: fx(1.5, "Australian dollar per USD (approx)"),
  INR: fx(83, "Indian rupee per USD (approx)"),
  BDT: fx(110, "Bangladeshi taka per USD (approx)"),
  PKR: fx(280, "Pakistani rupee per USD (approx)"),
  NGN: fx(1500, "Nigerian naira per USD (approx)"),
};

/**
 * Budget in `currency` → AUD, derived entirely from FX_RATES (units per USD), so
 * every budget→AUD conversion in the app reads ONE source of truth instead of a
 * divergent inline table. An unmapped/null currency passes through unchanged
 * (treated as already AUD), matching the prior converter's `default` branch.
 */
export function toAud(amount: number, currency: string | null): number {
  const rate = currency ? FX_RATES[currency as Currency]?.value : undefined;
  if (rate === undefined) return amount;
  const audPerUsd = FX_RATES.AUD?.value ?? 1;
  return (amount / rate) * audPerUsd;
}
