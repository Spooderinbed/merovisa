import { describe, it, expect } from "vitest";
import {
  FX_RATES,
  FX_REVERIFY_CADENCE_DAYS,
  FX_NRB_NPR_PER_AUD,
  FX_NRB_AS_OF,
  toAud,
} from "@/lib/data/policy/fx-rates";
import { CONFIG_PROVENANCE } from "@/lib/data/scoring-config";
import { staleScoringFacts, scoringRulesStale } from "@/lib/data/scoring-freshness";
import type { Currency } from "@/lib/scoring/types";

/**
 * FX freshness guard (MV-132, audit F-20).
 *
 * Every budget→AUD conversion in the app runs through FX_RATES, and the result
 * decides whether the DHA financial-capacity factor clears — so an FX rate is a
 * scoring-critical fact, not a cosmetic one. Before MV-132 the table was
 * unsourced and unguarded, and had drifted ~20% against the published rate: a
 * Nepali student's budget converted to A$50k when the NRB rate made it A$41.6k,
 * i.e. the error ran in the *falsely reassuring* direction.
 *
 * Unlike a DHA fee (which changes on a known date), an FX rate drifts
 * continuously — so `reverifyBy` here is a re-verification *cadence* bounded by
 * the drift a verdict can absorb, the same doctrine the harvested DHA datasets
 * use (tests/data/freshness.test.ts). This suite goes red when the cadence
 * elapses: the failure IS the re-verification reminder. Fix it by re-reading the
 * published rate and moving `lastVerified` + `reverifyBy` forward — never by
 * deleting the deadline.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;
const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;

/** Every rate except the USD identity, which is the table's unit, not a sourced fact. */
const sourcedRates = () =>
  (Object.entries(FX_RATES) as Array<[Currency, (typeof FX_RATES)[Currency]]>).filter(
    ([cur]) => cur !== "USD",
  );

describe("FX rates are sourced (AC: no verdict rides an unsourced number)", () => {
  it("the USD entry is the table's unit — identity, declared stable, nothing to verify", () => {
    // Asserted rather than merely skipped below: if USD ever stops being the
    // identity, it becomes a real sourced rate and must not slip through the
    // exemption the other tests grant it.
    expect(FX_RATES.USD?.value).toBe(1);
    expect(FX_RATES.USD?.provenance.volatility).toBe("stable");
    expect(FX_RATES.USD?.provenance.reverifyBy).toBeUndefined();
  });

  it("every other rate names an authority URL, a verification date, and a deadline", () => {
    const rates = sourcedRates();
    expect(rates.length).toBeGreaterThan(0);
    for (const [cur, rate] of rates) {
      const p = rate!.provenance;
      expect(p.source, `${cur} source`).toMatch(/^https:\/\//);
      expect(p.lastVerified, `${cur} lastVerified`).toMatch(ISO);
      expect(p.reverifyBy, `${cur} reverifyBy`).toMatch(ISO);
      // An FX rate is never "stable": declaring it so would exempt it from the
      // reverifyBy requirement in the shared provenance schema.
      expect(p.volatility, `${cur} volatility`).toBe("volatile");
      // The as-of date of the published figure, distinct from when we checked it.
      expect(p.effectiveDate, `${cur} effectiveDate`).toMatch(ISO);
    }
  });

  it("no rate is tagged internal-heuristic — an FX rate is an external number", () => {
    for (const [cur, rate] of sourcedRates()) {
      expect(rate!.provenance.source, `${cur}`).not.toBe("internal-heuristic");
    }
  });
});

describe("FX freshness guard", () => {
  it("no rate is past its reverifyBy — re-read the published rate, then move the deadline", () => {
    const today = new Date().toISOString().slice(0, 10);
    const due = sourcedRates()
      .filter(([, rate]) => rate!.provenance.reverifyBy! <= today)
      .map(([cur, rate]) => `${cur} (reverifyBy ${rate!.provenance.reverifyBy})`);
    expect(due).toEqual([]);
  });

  it("each deadline is after its own verification date, within the declared cadence", () => {
    for (const [cur, rate] of sourcedRates()) {
      const { lastVerified, reverifyBy } = rate!.provenance;
      // A deadline on/before its own lastVerified would fire immediately (stamp bug).
      expect(days(lastVerified!, reverifyBy!), `${cur} window`).toBeGreaterThan(0);
      // ...and one stretched past the cadence would let drift accumulate unguarded.
      expect(days(lastVerified!, reverifyBy!), `${cur} window`).toBeLessThanOrEqual(
        FX_REVERIFY_CADENCE_DAYS,
      );
    }
  });
});

describe("FX value fidelity (the cited figure and the code agree)", () => {
  it("the corridor cross-rate reproduces the NRB published NPR→AUD rate", () => {
    // NPR and AUD are stored per-USD, so the Nepal→Australia rate a student
    // actually gets is a composition of the two. If either leg is edited without
    // re-deriving the other, this goes red — the drift check the findings-ledger
    // reconciler gives module data, for a table that sits outside the ledger.
    expect(toAud(FX_NRB_NPR_PER_AUD, "NPR")).toBeCloseTo(1, 3);
  });

  it("both corridor legs are verified against the same published snapshot", () => {
    expect(FX_NRB_AS_OF).toMatch(ISO);
    expect(FX_RATES.NPR?.provenance.effectiveDate).toBe(FX_NRB_AS_OF);
    expect(FX_RATES.AUD?.provenance.effectiveDate).toBe(FX_NRB_AS_OF);
  });
});

describe("FX staleness reaches the verdict surface (MV-04 degrade seam)", () => {
  // The regression test for the hole this card closed: CONFIG_PROVENANCE carries
  // ONE provenance per config key, and FX_RATES used to be represented by
  // whichever rate came first in the table — the USD identity, which carries no
  // reverifyBy. So every real rate's deadline was invisible to staleScoringFacts,
  // and a months-old NPR rate could gate the DHA verdict without ever degrading
  // it. FX must be represented by its most urgent rate instead.
  const fxDeadline = () => CONFIG_PROVENANCE.FX_RATES!.reverifyBy!;
  const dayAfter = (iso: string) => new Date(Date.parse(iso) + MS_PER_DAY);

  it("the FX config key carries a deadline at all", () => {
    expect(fxDeadline()).toMatch(ISO);
  });

  it("it is the most urgent deadline across the rates, not an arbitrary one", () => {
    const earliest = sourcedRates()
      .map(([, rate]) => rate!.provenance.reverifyBy!)
      .sort()[0];
    expect(fxDeadline()).toBe(earliest);
  });

  it("once the FX cadence elapses, the verdict degrades", () => {
    const after = dayAfter(fxDeadline());
    expect(staleScoringFacts(after).map((f) => f.name)).toContain("FX_RATES");
    expect(scoringRulesStale(after)).toBe(true);
  });

  it("and it does not degrade before the deadline arrives", () => {
    const before = new Date(Date.parse(fxDeadline()) - MS_PER_DAY);
    expect(staleScoringFacts(before).map((f) => f.name)).not.toContain("FX_RATES");
  });

  it("FX is what trips it — the transition happens on the FX deadline, not another fact's", () => {
    // Asserted as a transition rather than `toEqual(["FX_RATES"])`: that exact-array
    // form would go red if any unrelated input were later given an earlier deadline,
    // a false failure during routine provenance maintenance. Crossing FX's own
    // deadline flipping the whole degrade from off to on is the property that matters.
    const before = new Date(Date.parse(fxDeadline()) - MS_PER_DAY);
    expect(scoringRulesStale(before)).toBe(false);
    expect(scoringRulesStale(dayAfter(fxDeadline()))).toBe(true);
  });
});
