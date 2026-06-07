import type { StudentProfile } from "./types";
import type { ProfileSections } from "@/lib/profiles/sections";

type FamilySituation = NonNullable<ProfileSections["family"]>["situation"];

/**
 * Map the signed-in `family.situation` enum onto the scored `dependents` signal,
 * so a re-score honours the DHA capacity floor the wizard already collects for
 * anonymous users. The enum carries no child *count*, so `spouse-and-kids` takes
 * a conservative one-child floor (consistent with the gate's bias against falsely
 * over-failing); `other` is ambiguous, so it doesn't raise the floor on a guess.
 */
function dependentsFromFamily(situation: FamilySituation): StudentProfile["dependents"] {
  switch (situation) {
    case "spouse":
      return { partner: true, children: 0 };
    case "spouse-and-kids":
      return { partner: true, children: 1 };
    default:
      return undefined; // alone / other / unset → applying alone
  }
}

export function sectionsToStudentProfile(sections: ProfileSections): StudentProfile {
  const academic = sections.academic;
  const english = sections.english;
  const finance = sections.finance;
  const gap = sections.gap;
  const career = sections.career;
  const dest = sections.destination;
  const study = sections["intended-study"];

  const hasScore = english?.overall != null;
  const hasTest = english?.test != null;
  const currentYear = new Date().getUTCFullYear();
  const gapYears = gap?.years ?? 0;
  const graduationYear = gapYears > 0 ? currentYear - gapYears : currentYear;

  return {
    homeCountry: "nepal",
    destination: dest?.primary ?? "australia",
    educationLevel: academic?.degree ?? "bachelors",
    gradeSystem: academic?.gradeSystem ?? "percentage-nepal",
    grade: academic?.gradePercent ?? 0,
    fieldOfStudy: study?.field ?? "other",
    graduationYear,
    gapReasons: gap?.reasons ?? [],
    englishStatus: hasScore ? "taken" : hasTest ? "booked" : "not-taken",
    englishScore: english?.overall,
    budget: finance?.total ?? 0,
    budgetCurrency: finance?.currency ?? "NPR",
    fundingSource: finance?.source ?? "self-funded",
    goal: career?.goal ?? "permanent-residency",
    dependents: dependentsFromFamily(sections.family?.situation),
  };
}
