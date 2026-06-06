import type { Sourced } from "@/lib/data/types";
import type { FundingSource } from "@/lib/scoring/types";

/**
 * Financial-dimension funding-reliability weights (mirrors lib/scoring/financial.ts).
 * Hand-calibrated heuristic: how strongly each funding source signals capacity to
 * a visa officer. Byte-identical to the current inline constant.
 */
export const FUNDING_RELIABILITY: Sourced<Record<FundingSource, number>> = {
  value: {
    "self-funded": 0.95,
    "parents-family": 0.9,
    "education-loan": 0.8,
    mixed: 0.85,
    "scholarship-dependent": 0.55,
  },
  provenance: {
    findingRefs: [],
    source: "internal-heuristic",
    note: "Reliability weight per funding source for the financial dimension.",
  },
};
