import type { Sourced } from "@/lib/data/types";
import type { Destination, GapReason } from "@/lib/scoring/types";

/**
 * Visa-dimension tuning tables (mirrors lib/scoring/visa.ts): the per-destination
 * minimum IELTS band, gap-reason mitigation weights, and the graduation-gap +
 * English score adjustments. Hand-calibrated heuristics; byte-identical to the
 * current inline constants so Phase 5's read-path swap is zero-delta.
 */
const INTERNAL = "internal-heuristic";

export const ENGLISH_THRESHOLD_BY_DEST: Sourced<Record<Destination, number>> = {
  value: {
    australia: 6.5,
    canada: 6.5,
    uk: 6.5,
    germany: 6.0,
    usa: 6.5,
    ireland: 6.5,
    "not-sure": 6.5,
  },
  provenance: {
    findingRefs: [],
    source: INTERNAL,
    note: "Minimum IELTS band expected per destination.",
  },
};

/**
 * The DHA "competent English" floor for the Subclass 500 student visa, as an
 * IELTS band in each component — distinct from (and below) the course-admission
 * thresholds above. Sourced from the DHA specified-instrument list (finding
 * J1.003); admissions often require 6.5+, but the *visa* only needs 6.0, so a
 * visa-valid 6.0–6.4 should not be scored as a shortfall. Only Australia is wired
 * into scoring today; the other corridors mirror the same floor until they ship.
 */
export const ENGLISH_VISA_FLOOR_BY_DEST: Sourced<Record<Destination, number>> = {
  value: {
    australia: 6.0,
    canada: 6.0,
    uk: 6.0,
    germany: 6.0,
    usa: 6.0,
    ireland: 6.0,
    "not-sure": 6.0,
  },
  provenance: {
    findingRefs: ["J1.003"],
    source: "https://immi.homeaffairs.gov.au/visa-eligibility/international",
    lastVerified: "2026-06-07",
    note: "DHA competent-English floor: IELTS 6.0 in each component for the Subclass 500 visa (admissions often require 6.5+).",
  },
};

export const GAP_REASON_WEIGHT: Sourced<Record<GapReason, number>> = {
  value: {
    worked: 0.9,
    "retook-exams": 0.75,
    preparing: 0.7,
    "started-something": 0.85,
    "health-family": 0.5,
  },
  provenance: {
    findingRefs: [],
    source: INTERNAL,
    note: "Mitigation weight per stated gap reason; 0.7 is the neutral pivot.",
  },
};

/** Visa-score adjustment by graduation-gap length, in years. */
export const GAP_PENALTIES: Sourced<{ none: number; upTo2: number; upTo5: number; beyond: number }> = {
  value: { none: 8, upTo2: -6, upTo5: -14, beyond: -22 },
  provenance: {
    findingRefs: [],
    source: INTERNAL,
    note: "none = no gap; upTo2 = 1-2y; upTo5 = 3-5y; beyond = 6y+.",
  },
};

/** Flat visa-score penalty when no English test has been taken. */
export const ENGLISH_NOT_TAKEN_PENALTY: Sourced<number> = {
  value: -8,
  provenance: { findingRefs: [], source: INTERNAL, note: "Applied when englishStatus is 'not-taken'." },
};

/** Visa points gained/lost per IELTS band above/below the destination threshold. */
export const ENGLISH_BAND_DELTA_POINTS: Sourced<number> = {
  value: 10,
  provenance: { findingRefs: [], source: INTERNAL, note: "Multiplies (englishScore − threshold)." },
};
