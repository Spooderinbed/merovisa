import type { MatchInputs } from "./types";
import type { ProfileSections } from "@/lib/profiles/sections";

export function sectionsToMatchInputs(
  sections: ProfileSections,
  policy: { nepalAssessmentLevel: "L2" | "L3" },
): MatchInputs {
  const english = sections.english;
  const hasBands =
    english?.listening != null &&
    english?.reading != null &&
    english?.writing != null &&
    english?.speaking != null;

  const minBand = hasBands
    ? Math.min(english!.listening!, english!.reading!, english!.writing!, english!.speaking!)
    : (english?.overall ?? null);

  return {
    userGradePercent: sections.academic?.gradePercent ?? null,
    userEnglishOverall: english?.overall ?? null,
    userEnglishBand: minBand != null && minBand > 0 ? minBand : null,
    userBudgetAud: budgetToAud(sections.finance?.total ?? null, sections.finance?.currency ?? null),
    userField: sections["intended-study"]?.field ?? null,
    policy,
  };
}

/** Budget conversion — rough static rates. Replace with FX lookup later. */
function budgetToAud(total: number | null, currency: string | null): number | null {
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
