import type { StudentProfile } from "./types";
import type { ProfileSections } from "@/lib/profiles/sections";

const FUNDING_MAP: Record<string, StudentProfile["fundingSource"]> = {
  self: "self-funded",
  parents: "parents-family",
  loan: "education-loan",
  scholarship: "scholarship-dependent",
  mixed: "mixed",
};

const DEGREE_MAP: Record<string, StudentProfile["educationLevel"]> = {
  "high-school": "higher-secondary",
  bachelors: "bachelors",
  masters: "masters",
  doctorate: "masters",
};

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
    destination: (dest?.primary as StudentProfile["destination"]) ?? "australia",
    educationLevel: DEGREE_MAP[academic?.degree ?? ""] ?? "bachelors",
    gradeSystem: (academic?.gradeSystem as StudentProfile["gradeSystem"]) ?? "percentage-nepal",
    grade: academic?.gradePercent ?? 0,
    fieldOfStudy: (study?.field as StudentProfile["fieldOfStudy"]) ?? "other",
    graduationYear,
    gapReasons: (gap?.reasons as StudentProfile["gapReasons"]) ?? [],
    englishStatus: hasScore ? "taken" : hasTest ? "booked" : "not-taken",
    englishScore: english?.overall,
    budget: finance?.total ?? 0,
    budgetCurrency: (finance?.currency as StudentProfile["budgetCurrency"]) ?? "NPR",
    fundingSource: FUNDING_MAP[finance?.source ?? ""] ?? "self-funded",
    goal: (career?.goal as StudentProfile["goal"]) ?? "permanent-residency",
  };
}
