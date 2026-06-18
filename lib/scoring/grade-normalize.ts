import type { GradeSystem } from "./types";

/**
 * Maximum value of each non-percentage grade scale. Percentage systems are
 * already 0–100 and are absent here (they pass through unchanged).
 */
const CGPA_SCALE_MAX: Partial<Record<GradeSystem, number>> = {
  "cgpa-4": 4,
  "cgpa-10": 10,
  "cgpa-5": 5,
};

/**
 * Normalize a raw grade to a 0–100 percentage scale keyed by its grade system,
 * so the academic scorer can compare any system against a percentage baseline.
 *
 * - `percentage-nepal`, `percentage-india`, `percentage`: already 0–100, returned
 *   as-is (clamped defensively).
 * - `cgpa-4`, `cgpa-10`, `cgpa-5`: a documented linear map, `(grade / scaleMax) * 100`
 *   (v1). This is a deliberate first-pass approximation — institution-specific
 *   CGPA→WAM conversion is a later refinement — but it is correct in ordering and
 *   far better than the prior behaviour (a CGPA read as a raw percentage floored
 *   the score to 0).
 *
 * Pure: no I/O, no side effects, output depends only on the arguments.
 */
export function normalizeGradeToPercentage(grade: number, gradeSystem: GradeSystem): number {
  const scaleMax = CGPA_SCALE_MAX[gradeSystem];
  const percentage = scaleMax ? (grade / scaleMax) * 100 : grade;
  return Math.max(0, Math.min(100, percentage));
}
