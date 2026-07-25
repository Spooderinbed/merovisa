import type { Sourced } from "@/lib/data/types";
import type { Currency } from "@/lib/scoring/types";

/**
 * FX rates as units of each currency per 1 USD — `toUsd` divides a budget by
 * these (mirrors lib/scoring/financial.ts). USD = 1 (identity). Modelled as a
 * `Partial` map so an unmapped currency is legible at the type level as
 * "no rate → passthrough" (toUsd returns the amount unchanged), which the
 * characterization golden `unknown-currency-passthrough` pins.
 *
 * MV-132 (audit F-20) gave these rates a source. They previously carried
 * `source: "internal-heuristic"` and no deadline, and had drifted badly: the
 * table's NPR 135/USD ÷ AUD 1.5/USD implied NPR 90 per A$1 while NRB published
 * ~108, so every Nepali budget converted ~20% high — the *falsely reassuring*
 * direction, on the number that decides the DHA financial-capacity factor.
 *
 * Why these rates sit outside the findings ledger: the ledger already considered
 * NRB FX rates and rejected them (findings D.003/D.004, `rejected:dynamic-data`,
 * "time-sensitive market rate") — a market quote can't be a stable finding. So
 * instead of a findingRef, each rate cites its publishing authority and commits to
 * a re-verification date, which the shared config provenance schema now requires
 * of any authority-cited value (lib/data/schema/scoring-config.schema.ts).
 *
 * Freshness doctrine: an FX rate has no known change date — it drifts every day —
 * so `reverifyBy` is a *cadence*, not an expiry, bounded by the drift a banded
 * verdict can absorb (see FX_REVERIFY_CADENCE_DAYS). The guard is
 * tests/data/fx-freshness.test.ts; the runtime degrade rides
 * CONFIG_PROVENANCE.FX_RATES → `rulesStale` onto the verdict card.
 */

/** Nepal Rastra Bank's daily reference rates — the corridor authority a Nepali student's bank quotes against. */
const NRB_FOREX = "https://www.nrb.org.np/forex/";
/** U.S. Treasury Reporting Rates of Exchange — official quarterly rates, used where NRB publishes none. */
const US_TREASURY_ROE =
  "https://fiscaldata.treasury.gov/datasets/treasury-reporting-rates-exchange/treasury-reporting-rates-of-exchange";

/** Date each rate below was last read from its publishing authority. */
const VERIFIED = "2026-07-25";
/** The re-verification deadline the freshness guard fires on (VERIFIED + the cadence). */
const REVERIFY_BY = "2026-10-25";

/**
 * How long an FX snapshot may stand before it must be re-read.
 *
 * Not a TTL dressed up as a deadline: it is the window in which observed NPR/AUD
 * drift stays small enough that it cannot move a *banded* verdict on its own. NRB
 * published ~109.5 NPR/AUD on 2026-06-05 (the repo's own D.003/D.004) and ~108.1
 * on 2026-07-24 — ~1.3% over seven weeks. A quarter therefore keeps expected drift
 * well inside the ~5% that could shift a budget across the DHA capacity cliff,
 * while the guard forces a fresh read before it compounds into the ~20% error this
 * card fixed.
 */
export const FX_REVERIFY_CADENCE_DAYS = 92;

/** NRB's published NPR per A$1 on FX_NRB_AS_OF — the figure the NPR + AUD legs must reproduce. */
export const FX_NRB_NPR_PER_AUD = 108.14;
/** As-of date of the NRB snapshot both corridor legs are derived from. */
export const FX_NRB_AS_OF = "2026-07-24";

/** A rate read from a named authority, with the re-verification commitment that entails. */
const sourced = (
  value: number,
  source: string,
  effectiveDate: string,
  note: string,
): Sourced<number> => ({
  value,
  provenance: {
    findingRefs: [],
    source,
    effectiveDate,
    lastVerified: VERIFIED,
    reverifyBy: REVERIFY_BY,
    volatility: "volatile",
    note,
  },
});

/** Treasury's quarter-end snapshot date the out-of-corridor rates are read from. */
const TREASURY_AS_OF = "2026-06-30";
const treasury = (value: number, note: string) =>
  sourced(value, US_TREASURY_ROE, TREASURY_AS_OF, note);

export const FX_RATES: Partial<Record<Currency, Sourced<number>>> = {
  // The table's unit. Nothing external to verify, so no source and no deadline —
  // the one entry the freshness guard exempts, and it asserts the identity holds.
  USD: {
    value: 1,
    provenance: {
      findingRefs: [],
      source: "internal-heuristic",
      volatility: "stable",
      note: "USD identity — the unit these rates are quoted in, not a market rate.",
    },
  },
  // Corridor legs (Nepal → Australia). Both read from the same NRB snapshot so
  // their composition reproduces NRB's published NPR/AUD exactly; editing one
  // without re-deriving the other is caught by the fidelity test.
  NPR: sourced(154.52, NRB_FOREX, FX_NRB_AS_OF, "NRB mid-rate, NPR per USD (buy 154.22 / sell 154.82)."),
  AUD: sourced(
    1.4289,
    NRB_FOREX,
    FX_NRB_AS_OF,
    "AUD per USD, cross-rate from NRB's two published legs: 154.52 NPR/USD ÷ 108.14 NPR/AUD (buy 107.93 / sell 108.35).",
  ),
  // Out of the MVP corridor: NRB publishes no rate for these, so they come from
  // the U.S. Treasury's official quarterly schedule. Still reachable via the
  // profile money editor's currency list, so they are sourced rather than left to
  // the unmapped-currency passthrough (which would read foreign money as AUD).
  INR: treasury(94.66, "Treasury Reporting Rate, INR per USD."),
  BDT: treasury(123.0, "Treasury Reporting Rate, BDT per USD."),
  PKR: treasury(277.7, "Treasury Reporting Rate, PKR per USD."),
  NGN: treasury(1380.08, "Treasury Reporting Rate, NGN per USD."),
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
