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
 *
 * AU_REPRESENTATIVE_TUITION_AUD and AU_DHA_CAPACITY_GATE back the financial
 * dimension's DHA capacity gate (Australia): the gov living figure above + a
 * representative first-year tuition forms the visa's financial-capacity floor a
 * student's budget is checked against. Both are honestly heuristic-tagged.
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

const DHA_SSVF_SOURCE =
  "https://immi.homeaffairs.gov.au/what-we-do/education-program/what-we-do/simplified-student-visa-framework";

export const AU_DHA_INCOME_METHOD_THRESHOLD_AUD: Sourced<number> = {
  value: 87_856,
  provenance: {
    findingRefs: ["B.006"],
    source: DHA_SSVF_SOURCE,
    lastVerified: "2026-06-07",
    note: "DHA annual personal-income threshold accepted from a parent or partner as proof of financial capacity (AUD), in lieu of the savings/deposit method.",
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

/**
 * Representative first-year international tuition for an Australian course (AUD).
 * The median of `tuitionMin` across the 64 sourced AU programs in
 * lib/programs/seed.ts (range 30,000–60,000; median 44,500). `tuitionMin` rather
 * than the min/max midpoint is deliberately conservative, so the DHA capacity
 * gate is less likely to falsely fail a borderline student. Heuristic-tagged
 * (derived from sourced data, not a single published figure); recompute and bump
 * CONFIG_VERSION if the program dataset's tuition distribution shifts materially.
 */
export const AU_REPRESENTATIVE_TUITION_AUD: Sourced<number> = {
  value: 44_500,
  provenance: {
    findingRefs: [],
    source: "internal-heuristic",
    lastVerified: "2026-06-07",
    note: "Median tuitionMin across the AU programs in lib/programs/seed.ts (64 programs, 2026-06-04).",
  },
};

/**
 * Tuning for the financial dimension's DHA capacity gate (Australia). The gate
 * compares the student's budget to the visa's financial-capacity floor
 * (AU_DHA_LIVING_CAPACITY_AUD + AU_REPRESENTATIVE_TUITION_AUD):
 *   budget ≥ floor                  → clears (no cap)
 *   reachRatio·floor ≤ budget < floor → financial capped at blockStrongCap (can't be 'strong')
 *   budget < reachRatio·floor       → financial capped at forceReachCap (forces 'reach')
 * The caps land just under the verdict.ts min-dimension thresholds (50 / 30), so
 * they leverage the existing floors rather than inventing new verdict logic.
 * Heuristic policy knobs, tunable.
 */
export const AU_DHA_CAPACITY_GATE: Sourced<{
  reachRatio: number;
  blockStrongCap: number;
  forceReachCap: number;
}> = {
  value: { reachRatio: 0.75, blockStrongCap: 49, forceReachCap: 29 },
  provenance: {
    findingRefs: [],
    source: "internal-heuristic",
    note: "DHA capacity-gate cliffs/caps; reachRatio 0.75 of the capacity floor forces a 'reach'.",
  },
};
