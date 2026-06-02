import type { StudentProfile } from "@/lib/scoring/types";
import type { CalloutStep } from "@/lib/callouts/types";
import type { WizardStepKey } from "./use-wizard-state";

export const STEP_CALLOUT_KEY: Partial<Record<WizardStepKey, CalloutStep>> = {
  homeCountry: "homeCountry",
  education: "education",
  fieldOfStudy: "fieldOfStudy",
  graduationYear: "graduationYear",
  english: "english",
  destination: "destination",
  budget: "budget",
  goal: "goal",
};

export function isStepComplete(step: WizardStepKey, p: Partial<StudentProfile>): boolean {
  switch (step) {
    case "homeCountry":
      return Boolean(p.homeCountry);
    case "education":
      return Boolean(p.educationLevel) && typeof p.grade === "number";
    case "fieldOfStudy":
      return Boolean(p.fieldOfStudy);
    case "graduationYear":
      return typeof p.graduationYear === "number";
    case "gap":
      return Array.isArray(p.gapReasons) && p.gapReasons.length > 0;
    case "english":
      return p.englishStatus === "taken" ? typeof p.englishScore === "number" : Boolean(p.englishStatus);
    case "destination":
      return Boolean(p.destination);
    case "budget":
      return typeof p.budget === "number" && Boolean(p.budgetCurrency) && Boolean(p.fundingSource);
    case "goal":
      return Boolean(p.goal);
    default:
      return false;
  }
}
