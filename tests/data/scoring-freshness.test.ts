import { describe, it, expect } from "vitest";
import type { Provenance } from "@/lib/data/types";
import {
  staleFactsAmong,
  staleScoringFacts,
  scoringRulesStale,
} from "@/lib/data/scoring-freshness";

/**
 * Runtime + CI freshness for scoring-critical facts (MV-04).
 *
 * The blanket guard (tests/data/freshness.test.ts) walks DATA_MODULES, but the
 * pure scoring-policy modules (field-competitiveness, fx-rates, english-
 * thresholds, verdict-thresholds, …) are NOT registered there — so nothing
 * guards the verdict-scoring inputs as a class. This helper does: it walks
 * CONFIG_PROVENANCE (the exact inputs the engine reads) and flags any past its
 * reverifyBy, powering both this CI guard and the runtime verdict-card degrade.
 */
describe("scoring-freshness predicate mechanics", () => {
  const fixture: Record<string, Provenance> = {
    PAST: { findingRefs: ["X.1"], reverifyBy: "2026-01-01", lastVerified: "2025-01-01" },
    FUTURE: { findingRefs: ["X.2"], reverifyBy: "2099-01-01" },
    INTERNAL: { findingRefs: ["X.3"] }, // no reverifyBy → stable heuristic, never stale
  };

  it("flags a fact whose reverifyBy has passed, carrying its dates", () => {
    expect(staleFactsAmong(fixture, new Date("2026-06-19"))).toEqual([
      { name: "PAST", reverifyBy: "2026-01-01", lastVerified: "2025-01-01" },
    ]);
  });

  it("treats a deadline that is today as due — degrade on the written date, not after it", () => {
    const onDate = staleFactsAmong(
      { X: { findingRefs: ["a"], reverifyBy: "2026-06-19" } },
      new Date("2026-06-19"),
    );
    expect(onDate).toHaveLength(1);
  });

  it("a future deadline and a no-deadline heuristic are not stale", () => {
    expect(staleFactsAmong(fixture, new Date("2020-01-01"))).toEqual([]);
  });
});

describe("scoring-critical freshness guard (real CONFIG_PROVENANCE)", () => {
  it("no scoring-critical fact is past its reverifyBy today — re-verify the source, then move the deadline forward", () => {
    // The CI guard: goes red the day a verdict-scoring input actually ages out,
    // so a stale verdict can't ship presented as current. Fix by re-verifying the
    // source and moving reverifyBy (+ lastVerified) forward, never by deleting it.
    const due = staleScoringFacts().map((f) => `${f.name} (reverifyBy ${f.reverifyBy})`);
    expect(due).toEqual([]);
  });

  it("walks the real config — a far-future clock flags the dated DHA inputs", () => {
    const names = staleScoringFacts(new Date("2099-01-01")).map((f) => f.name);
    expect(names).toContain("AU_DHA_LIVING_CAPACITY_AUD");
    expect(scoringRulesStale(new Date("2099-01-01"))).toBe(true);
    expect(scoringRulesStale(new Date("2020-01-01"))).toBe(false);
  });
});
