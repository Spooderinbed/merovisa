import type { Provenance } from "./types";
import { CONFIG_PROVENANCE } from "./scoring-config";

/**
 * Runtime data-freshness for the verdict-scoring inputs (MV-04).
 *
 * A scoring-critical fact whose `reverifyBy` has arrived may have changed at the
 * source — so a verdict computed from its old value can no longer be presented as
 * current. This module is the single predicate behind two surfaces:
 *
 *  - **CI guard** (tests/data/scoring-freshness.test.ts) — fails the build the day
 *    any CONFIG_PROVENANCE input ages out, so a stale rule set can't ship unnoticed.
 *  - **Runtime degrade** — `scoringRulesStale(now)` rides the assessment payload
 *    (server-side) so the verdict card can warn + lower confidence as the deployed
 *    app's clock crosses a reverifyBy *between* deploys (the case CI can't catch).
 *
 * Degradation rule (per fact class): the verdict-scoring inputs here degrade
 * *visibly* on the verdict card (warn + treat-as-indicative), never silently.
 * Reference / cost-only facts are out of scope — they stay covered by the blanket
 * build-time guard (tests/data/freshness.test.ts) and must not nuke the UI. A
 * stable heuristic carries no `reverifyBy` (nothing external to re-verify) and is
 * never stale.
 *
 * Server-side only: it pulls CONFIG_PROVENANCE, so importing it into client JS
 * would ship the scoring config — keep it on the server→client payload seam.
 */

export interface StaleScoringFact {
  /** CONFIG_PROVENANCE key, e.g. "AU_DHA_LIVING_CAPACITY_AUD". */
  name: string;
  /** The reverify deadline that has arrived (today or earlier). */
  reverifyBy: string;
  /** When the source was last verified, where provenance records it. */
  lastVerified?: string;
}

/**
 * Facts in `provenanceByName` whose `reverifyBy` has arrived as of `now`. ISO
 * dates compare lexicographically; due on the written date, not after it (same
 * predicate as the blanket freshness guard). Pure over the passed map, so it is
 * unit-testable with a fixture.
 */
export function staleFactsAmong(
  provenanceByName: Record<string, Provenance>,
  now: Date = new Date(),
): StaleScoringFact[] {
  const today = now.toISOString().slice(0, 10);
  const out: StaleScoringFact[] = [];
  for (const [name, p] of Object.entries(provenanceByName)) {
    if (typeof p.reverifyBy === "string" && p.reverifyBy <= today) {
      out.push({ name, reverifyBy: p.reverifyBy, lastVerified: p.lastVerified });
    }
  }
  return out;
}

/** The scoring config's stale-as-of-`now` inputs (CONFIG_PROVENANCE). */
export function staleScoringFacts(now: Date = new Date()): StaleScoringFact[] {
  return staleFactsAmong(CONFIG_PROVENANCE, now);
}

/** True when any verdict-scoring input is past its reverifyBy as of `now`. */
export function scoringRulesStale(now: Date = new Date()): boolean {
  return staleScoringFacts(now).length > 0;
}
