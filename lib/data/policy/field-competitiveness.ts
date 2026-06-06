import type { Sourced } from "@/lib/data/types";
import type { EducationLevel, FieldOfStudy } from "@/lib/scoring/types";

/**
 * Academic-dimension tuning tables (mirrors lib/scoring/academic.ts).
 *
 * These are hand-calibrated heuristics — admission competitiveness by field and
 * a score bonus by completed education level — not drawn from a single research
 * finding, so they carry `source: "internal-heuristic"` to surface honestly for
 * review rather than masquerade as sourced. Values are byte-identical to the
 * current inline constants so Phase 5 can swap the read-path with zero delta.
 */
const INTERNAL = "internal-heuristic";

export const FIELD_COMPETITIVENESS: Sourced<Record<FieldOfStudy, number>> = {
  value: {
    "computer-science": 0.95,
    "data-science": 0.95,
    engineering: 0.9,
    business: 0.85,
    nursing: 0.85,
    accounting: 0.8,
    law: 0.85,
    education: 0.75,
    hospitality: 0.7,
    agriculture: 0.7,
    arts: 0.7,
    other: 0.8,
  },
  provenance: {
    findingRefs: [],
    source: INTERNAL,
    note: "Admission competitiveness weight per field of study; raises the baseline grade threshold.",
  },
};

export const LEVEL_BONUS: Sourced<Record<EducationLevel, number>> = {
  value: { "higher-secondary": -5, bachelors: 0, masters: 6 },
  provenance: {
    findingRefs: [],
    source: INTERNAL,
    note: "Academic-score adjustment by completed education level.",
  },
};
