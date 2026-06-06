import type { Sourced } from "@/lib/data/types";
import type { Destination } from "@/lib/scoring/types";

/**
 * Australian cost-of-living source of truth.
 *
 * The AU_DHA_* values are the DHA Subclass 500 annual financial-capacity figures
 * (gov, immi.homeaffairs.gov.au), effective for visas lodged on/after 10 May 2024.
 * The single-student figure is corroborated by two primary findings (A.015 in the
 * visa-documents category, B.002 in the finance category — the same regulatory
 * number); the dependant/school figures back the constants in lib/programs/policy.ts.
 * Together these resolve the unlinked living-cost copies the audit found.
 *
 * TYPICAL_YEARLY_USD is a separate planning range (tuition + living) used by the
 * financial dimension; it is a hand-calibrated heuristic, not the regulatory
 * figure, so it is tagged accordingly. Byte-identical to lib/scoring/financial.ts.
 */
const DHA_SOURCE = "https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=1196";

export const AU_DHA_LIVING_CAPACITY_AUD: Sourced<number> = {
  value: 29_710,
  provenance: {
    findingRefs: ["A.015", "B.002"],
    source: DHA_SOURCE,
    effectiveDate: "2024-05-10",
    lastVerified: "2026-06-07",
    note: "DHA Subclass 500 individual-student annual financial-capacity figure (AUD).",
  },
};

export const AU_DHA_PARTNER_CAPACITY_AUD: Sourced<number> = {
  value: 10_394,
  provenance: {
    findingRefs: ["B.003"],
    source: DHA_SOURCE,
    effectiveDate: "2024-05-10",
    lastVerified: "2026-06-07",
    note: "DHA Subclass 500 annual financial-capacity figure for a partner/spouse (AUD).",
  },
};

export const AU_DHA_CHILD_CAPACITY_AUD: Sourced<number> = {
  value: 4_449,
  provenance: {
    findingRefs: ["B.004"],
    source: DHA_SOURCE,
    effectiveDate: "2024-05-10",
    lastVerified: "2026-06-07",
    note: "DHA Subclass 500 annual financial-capacity figure for a dependent child (AUD).",
  },
};

export const AU_DHA_SCHOOL_COSTS_AUD: Sourced<number> = {
  value: 13_502,
  provenance: {
    findingRefs: ["B.005"],
    source: DHA_SOURCE,
    effectiveDate: "2024-05-10",
    lastVerified: "2026-06-07",
    note: "DHA Subclass 500 annual school-costs figure for a school-aged dependant (AUD).",
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
