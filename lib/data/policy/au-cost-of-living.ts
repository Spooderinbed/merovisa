import type { Sourced } from "@/lib/data/types";
import type { Destination } from "@/lib/scoring/types";

/**
 * Australian cost-of-living source of truth.
 *
 * AU_DHA_LIVING_CAPACITY_AUD is the regulatory floor — the DHA Subclass 500
 * single-student financial-capacity figure — and is genuinely sourced to finding
 * A.015 (gov, immi.homeaffairs.gov.au), effective for visas lodged on/after
 * 10 May 2024. This is the single value that resolves the three unlinked
 * living-cost copies the audit found (policy.ts, generator.ts).
 *
 * TYPICAL_YEARLY_USD is a separate planning range (tuition + living) used by the
 * financial dimension; it is a hand-calibrated heuristic, not the regulatory
 * figure, so it is tagged accordingly. Byte-identical to lib/scoring/financial.ts.
 */
export const AU_DHA_LIVING_CAPACITY_AUD: Sourced<number> = {
  value: 29_710,
  provenance: {
    findingRefs: ["A.015"],
    source: "https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=1196",
    effectiveDate: "2024-05-10",
    lastVerified: "2026-06-02",
    note: "DHA Subclass 500 individual-student financial capacity figure (AUD).",
  },
};

export const TYPICAL_YEARLY_USD: Sourced<Record<Destination, { min: number; max: number }>> = {
  value: {
    australia: { min: 30000, max: 55000 },
    canada: { min: 25000, max: 45000 },
    uk: { min: 28000, max: 50000 },
    germany: { min: 12000, max: 22000 },
    usa: { min: 40000, max: 75000 },
    ireland: { min: 25000, max: 40000 },
    "not-sure": { min: 25000, max: 45000 },
  },
  provenance: {
    findingRefs: [],
    source: "internal-heuristic",
    note: "Typical all-in yearly cost (tuition + living) band per destination, USD.",
  },
};
