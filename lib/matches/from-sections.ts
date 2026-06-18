import type { MatchInputs } from "./types";
import type { ProfileSections } from "@/lib/profiles/sections";
import type { EducationLevel } from "@/lib/scoring/types";
import type { ProgramLevel } from "@/lib/programs/types";
import { toIeltsEquivalent } from "@/lib/scoring/english-equivalent";

/**
 * Maps a student's *current* education level to the program level they
 * realistically target next. The catalogue holds bachelors + masters only
 * (0 doctorate), so a masters-holder is mapped to masters rather than a level we
 * cannot serve.
 */
export const TARGET_LEVEL_BY_CURRENT_EDUCATION: Record<EducationLevel, ProgramLevel> = {
  "higher-secondary": "bachelors",
  bachelors: "masters",
  masters: "masters",
};

/**
 * Resolves the program level to filter matches by. An explicit
 * `intended-study.level` (the level the user wants to study AT) wins and is
 * passed through as a target tier; otherwise we map the current academic degree.
 * Returns null when no academic data exists — the caller then skips the level filter.
 */
function targetLevel(sections: ProfileSections): ProgramLevel | null {
  const explicit = sections["intended-study"]?.level;
  if (explicit) return explicit === "higher-secondary" ? "bachelors" : explicit;
  const current = sections.academic?.degree;
  return current ? TARGET_LEVEL_BY_CURRENT_EDUCATION[current] : null;
}

export function sectionsToMatchInputs(
  sections: ProfileSections,
  policy: { nepalAssessmentLevel: "L2" | "L3" },
): MatchInputs {
  const english = sections.english;
  const test = english?.test;
  const isIelts = test === undefined || test === "ielts";

  // The program thresholds are IELTS bands, so the user's score is converted to its
  // IELTS equivalent before comparison (undefined/IELTS test ⇒ unchanged).
  const overall =
    english?.overall != null ? toIeltsEquivalent(english.overall, test) : null;

  // Per-subskill scores are only IELTS bands for an IELTS test. For PTE/TOEFL the
  // raw sub-scores are not IELTS bands, so the band proxy falls back to the
  // converted overall rather than mis-reading a raw PTE 50 as an IELTS 50.
  const hasBands =
    english?.listening != null &&
    english?.reading != null &&
    english?.writing != null &&
    english?.speaking != null;

  const minBand =
    isIelts && hasBands
      ? Math.min(english!.listening!, english!.reading!, english!.writing!, english!.speaking!)
      : overall;

  return {
    userGradePercent: sections.academic?.gradePercent ?? null,
    userEnglishOverall: overall,
    userEnglishBand: minBand != null && minBand > 0 ? minBand : null,
    userBudgetAud: budgetToAud(sections.finance?.total ?? null, sections.finance?.currency ?? null),
    userField: sections["intended-study"]?.field ?? null,
    userTargetLevel: targetLevel(sections),
    policy,
  };
}

/** Budget conversion — rough static rates. Replace with FX lookup later. */
export function budgetToAud(total: number | null, currency: string | null): number | null {
  if (total == null) return null;
  switch (currency) {
    case "AUD": return total;
    case "USD": return total * 1.5;
    case "NPR": return total / 100; // ~AUD 1 = NPR 90-100
    case "INR": return total / 55;  // ~AUD 1 = INR 55
    case "BDT": return total / 75;
    case "PKR": return total / 200;
    case "NGN": return total / 1000;
    default: return total;
  }
}
