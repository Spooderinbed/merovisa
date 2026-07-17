import type { MatchInputs } from "./types";
import type { StudentProfile } from "@/lib/scoring/types";
import { toIeltsEquivalent } from "@/lib/scoring/english-equivalent";
import { normalizeGradeToPercentage } from "@/lib/scoring/grade-normalize";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import { budgetToAud, TARGET_LEVEL_BY_CURRENT_EDUCATION } from "./from-sections";
import { auFinancialCapacity } from "./capacity";

/**
 * The English band the matcher should use for an anonymous profile. Unlike the
 * signed-in path (which has explicit per-band scores or null), the wizard collects
 * a single overall score and a status. Mirrors the deprecated anonymous engine's
 * intentional provisional baseline: a student who has not yet sat the test is given
 * a realistic assumption (booked → 6.5, not-taken → 6.0) so a first-time visitor is
 * not shown an all-"reach" list purely for lacking a score. This is a deliberate
 * anonymous-only difference from the signed-in path (which treats unknown as null).
 */
function effectiveEnglish(profile: StudentProfile): number {
  if (profile.englishStatus === "taken" && typeof profile.englishScore === "number") {
    // Convert to the IELTS-equivalent band so PTE/TOEFL are compared against each
    // program's IELTS minimum (undefined test ⇒ IELTS, unchanged).
    return toIeltsEquivalent(profile.englishScore, profile.englishTest);
  }
  if (profile.englishStatus === "booked") return 6.5;
  return 6.0;
}

/**
 * Adapts an anonymous wizard `StudentProfile` to the shared `MatchInputs` consumed
 * by `computeMatches` — the same engine, catalogue, and filters the signed-in path
 * uses (see lib/matches/from-sections.ts). Critically it normalizes the grade by its
 * grade system so a CGPA reaches the scorer instead of collapsing every match to
 * "reach". The result is that an anonymous student and the same student after
 * signing in get the same field/level-eligible match set.
 */
export function profileToMatchInputs(profile: StudentProfile): MatchInputs {
  const english = effectiveEnglish(profile);
  return {
    userGradePercent: normalizeGradeToPercentage(profile.grade, profile.gradeSystem),
    userEnglishOverall: english,
    userEnglishBand: english,
    userBudgetAud: budgetToAud(profile.budget, profile.budgetCurrency),
    userField: profile.fieldOfStudy,
    alsoFields: profile.alsoConsidering ?? [],
    userTargetLevel: TARGET_LEVEL_BY_CURRENT_EDUCATION[profile.educationLevel],
    policy: {
      nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL,
      financialCapacity: auFinancialCapacity(profile.dependents),
    },
  };
}
