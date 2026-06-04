import type { StudentProfile } from "./types";
import type { ProfileSections } from "@/lib/profiles/sections";

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
  };
}
