import type { GradeSystem } from "./types";
import { normalizeGradeToPercentage } from "./grade-normalize";

export interface GradeScale { min: number; max: number; step: number; decimals: number; label: string; }

// Nepal's two grade systems. percentage floor 40 matches the current wizard slider; GPA floor 2.0 is a sensible passing floor.
export const GRADE_SCALES: Record<"percentage-nepal" | "cgpa-4", GradeScale> = {
  "percentage-nepal": { min: 40, max: 100, step: 1, decimals: 0, label: "Percentage" },
  "cgpa-4": { min: 2, max: 4, step: 0.1, decimals: 1, label: "GPA / 4.0" },
};

export function gradeScaleFor(system: GradeSystem): GradeScale {
  return system === "cgpa-4" ? GRADE_SCALES["cgpa-4"] : GRADE_SCALES["percentage-nepal"];
}

// Grade on its own system -> 0..100 percentage (reuses the scoring engine's normalizer, single source of truth).
export const gradeToPercentage = normalizeGradeToPercentage;

// 0..100 percentage -> a grade on the target system's scale.
// percentage systems pass through; cgpa-4 = pct/100*4, rounded to 1 decimal.
export function gradeFromPercentage(pct: number, system: GradeSystem): number {
  if (system === "cgpa-4") return Math.round((pct / 100) * 4 * 10) / 10;
  return Math.round(pct);
}
