import type { EducationLevel, GradeSystem } from "@/lib/scoring/types";
import { normalizeGradeToPercentage } from "@/lib/scoring/grade-normalize";

export interface AcademicPatchInput {
  institution?: string;
  degree?: EducationLevel;
  gradePercent?: number;
  gradeSystem?: GradeSystem;
}

/** Always-canonical academic patch: a true 0–100 gradePercent, gradeSystem cleared. */
export interface NormalizedAcademicPatch {
  institution?: string;
  degree?: EducationLevel;
  gradePercent?: number;
  /** Deliberately never a real value — cleared so the merge can't keep a stale one. */
  gradeSystem?: undefined;
}

/**
 * Canonicalizes an academic section patch at the save boundary, mirroring
 * profileSectionsFromAssessment: `gradePercent` is stored as a true 0–100
 * percentage and `gradeSystem` is never persisted (the MV-01 invariant).
 *
 * The profile editor submits a raw grade in a chosen system (e.g. CGPA 3.5 /
 * cgpa-4). Stored raw, a downstream reader mis-reads "3.5" as 3.5% — collapsing
 * every signed-in match to "reach" while the verdict path normalizes to 87.5%.
 *
 * gradeSystem is set to `undefined` (not merely omitted) on purpose:
 * patchProfileSection merges `{ ...stored, ...patch }`, so a stale gradeSystem on
 * a pre-fix row is only cleared if the patch overwrites it — the JSONB write then
 * drops the undefined key. Re-attaching the source system would re-trigger
 * normalization (double-counting) on the next read.
 */
export function normalizeAcademicPatch(patch: AcademicPatchInput): NormalizedAcademicPatch {
  const { gradeSystem, gradePercent, ...rest } = patch;
  const out: NormalizedAcademicPatch = { ...rest, gradeSystem: undefined };
  if (gradePercent !== undefined) {
    out.gradePercent = normalizeGradeToPercentage(gradePercent, gradeSystem ?? "percentage");
  }
  return out;
}
