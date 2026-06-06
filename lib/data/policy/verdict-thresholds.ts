import type { Sourced } from "@/lib/data/types";

/**
 * Engine-level scoring tunables (mirrors lib/scoring/engine.ts, verdict.ts and
 * profile-strength.ts): the dimension blend weights, the band cutoffs, and the
 * profile-strength point table. Hand-calibrated heuristics; byte-identical to the
 * current inline constants so Phase 5's read-path swap is zero-delta.
 */
const INTERNAL = "internal-heuristic";

export const DIMENSION_WEIGHTS: Sourced<{
  academic: number;
  financial: number;
  visa: number;
  profileStrength: number;
}> = {
  value: { academic: 0.3, financial: 0.25, visa: 0.25, profileStrength: 0.2 },
  provenance: {
    findingRefs: [],
    source: INTERNAL,
    note: "Weighted-score blend across the four dimensions (sums to 1.0).",
  },
};

export const VERDICT_CUTOFFS: Sourced<{
  strongWeighted: number;
  strongMinDimension: number;
  possibleWeighted: number;
  minDimensionFloor: number;
}> = {
  value: { strongWeighted: 72, strongMinDimension: 50, possibleWeighted: 50, minDimensionFloor: 30 },
  provenance: {
    findingRefs: [],
    source: INTERNAL,
    note: "strong ≥72 with min-dim ≥50; possible ≥50 with min-dim ≥30; any dim <30 → reach.",
  },
};

export const PROFILE_STRENGTH_POINTS: Sourced<{
  base: number;
  masters: number;
  bachelors: number;
  work: number;
  venture: number;
  english75: number;
  english70: number;
}> = {
  value: { base: 55, masters: 18, bachelors: 8, work: 10, venture: 6, english75: 8, english70: 5 },
  provenance: {
    findingRefs: [],
    source: INTERNAL,
    note: "Profile-strength dimension: base plus additive points for level, work/venture, and IELTS ≥7.0/≥7.5.",
  },
};
