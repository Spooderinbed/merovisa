import type { EnglishTest } from "./types";
import { AU_ENGLISH_TESTS } from "@/lib/data/source/au-english-tests";

/**
 * Convert a raw English-test score to its IELTS-band equivalent so the scorer and
 * matching can compare every test against IELTS-denominated thresholds.
 *
 * Why this exists: `StudentProfile.englishScore` carries the score in the test's
 * OWN scale (a PTE 58, a TOEFL 79), but every threshold in the product is an IELTS
 * band (DHA visa floor 6.0, course preference 6.5, per-program minimums). Without
 * conversion a PTE 58 (≈ IELTS 6.5) is read as a failing "5.8". `englishTest` is
 * optional and OMITTED ⇒ IELTS — so all pre-existing data and the wizard default
 * pass through unchanged (this keeps the scoring goldens byte-identical).
 *
 * Source of the mapping:
 * - The DHA "competent English" anchor (IELTS 6.0) is tied to the verified per-test
 *   records in lib/data/source/au-english-tests.ts (DHA specified-instrument list,
 *   effective 2025-08-07): PTE 50 / TOEFL iBT 60 are the conventional overall scores
 *   DHA treats as IELTS-6.0-equivalent. `assertFloorsAreSourced` keeps those anchors
 *   honest against the sourced acceptance fact.
 * - The rest of the curve uses the official published concordances (Pearson PTE↔IELTS
 *   and ETS TOEFL iBT↔IELTS) as piecewise-linear band anchors.
 *
 * Pure: no I/O, no side effects, output depends only on the arguments.
 */

/** One point on a test's score→IELTS concordance curve. */
interface ConcordancePoint {
  /** A raw score in the test's own scale. */
  raw: number;
  /** The IELTS band that raw score is concorded to. */
  ielts: number;
}

/**
 * The au-english-tests record id whose DHA acceptance backs each test's IELTS-6.0
 * floor anchor. Read so the floor stays tied to the sourced acceptance fact rather
 * than being a free-floating constant.
 */
const FLOOR_SOURCE_ID: Record<Exclude<EnglishTest, "ielts">, string> = {
  pte: "pte-academic",
  toefl: "toefl-ibt",
};

/**
 * True when every non-IELTS floor anchor is backed by a DHA-accepted record in the
 * sourced data. Throws at module load if a record is missing or no longer accepted,
 * so a silent drift in the sourced acceptance list surfaces here.
 */
function assertFloorsAreSourced(): void {
  for (const [test, id] of Object.entries(FLOOR_SOURCE_ID)) {
    const record = AU_ENGLISH_TESTS.find((t) => t.id === id);
    if (!record || record.acceptedByDha !== true) {
      throw new Error(
        `english-equivalent: floor anchor for "${test}" expects a DHA-accepted "${id}" record in au-english-tests`,
      );
    }
  }
}
assertFloorsAreSourced();

/**
 * Piecewise-linear concordance anchors per test, lowest→highest raw score. The
 * IELTS-6.0 point is the DHA competent-English floor (FLOOR_SOURCE_ID); the
 * surrounding points are the official Pearson / ETS published concordances.
 */
const CONCORDANCE: Record<Exclude<EnglishTest, "ielts">, ConcordancePoint[]> = {
  // Pearson PTE Academic ↔ IELTS (published concordance). PTE 50 → IELTS 6.0 is the
  // DHA competent-English floor (au-english-tests pte-academic).
  pte: [
    { raw: 30, ielts: 4.5 },
    { raw: 36, ielts: 5.0 },
    { raw: 42, ielts: 5.5 },
    { raw: 50, ielts: 6.0 },
    { raw: 58, ielts: 6.5 },
    { raw: 65, ielts: 7.0 },
    { raw: 73, ielts: 7.5 },
    { raw: 79, ielts: 8.0 },
    { raw: 83, ielts: 8.5 },
    { raw: 86, ielts: 9.0 },
  ],
  // ETS TOEFL iBT ↔ IELTS (published concordance). TOEFL 60 → IELTS 6.0 is the DHA
  // competent-English floor (au-english-tests toefl-ibt).
  toefl: [
    { raw: 32, ielts: 4.5 },
    { raw: 46, ielts: 5.0 },
    { raw: 60, ielts: 6.0 },
    { raw: 79, ielts: 6.5 },
    { raw: 94, ielts: 7.0 },
    { raw: 102, ielts: 7.5 },
    { raw: 110, ielts: 8.0 },
    { raw: 115, ielts: 8.5 },
    { raw: 118, ielts: 9.0 },
  ],
};

/** Round to the nearest 0.5 IELTS band. */
function toHalfBand(n: number): number {
  return Math.round(n * 2) / 2;
}

/** Interpolate an IELTS band from a test's concordance anchors, clamped to the curve. */
function interpolate(score: number, points: ConcordancePoint[]): number {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (score <= first.raw) return first.ielts;
  if (score >= last.raw) return last.ielts;
  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i]!;
    const hi = points[i + 1]!;
    if (score >= lo.raw && score <= hi.raw) {
      const t = (score - lo.raw) / (hi.raw - lo.raw);
      return toHalfBand(lo.ielts + t * (hi.ielts - lo.ielts));
    }
  }
  return last.ielts;
}

/**
 * Map a raw English-test `score` to its IELTS-band equivalent.
 *
 * - `ielts` or undefined (back-compat default): the score IS an IELTS band — passed
 *   through unchanged.
 * - `pte`, `toefl`: interpolated against the test's concordance and rounded to the
 *   nearest 0.5 band.
 */
export function toIeltsEquivalent(score: number, test: EnglishTest | undefined): number {
  if (test === undefined || test === "ielts") return score;
  return interpolate(score, CONCORDANCE[test]);
}
