import type { StudentProfile } from "@/lib/scoring/types";
import { computeGapYears } from "@/lib/scoring/gap";
import { toAud } from "@/lib/data/policy/fx-rates";
import { AU_DHA_LIVING_CAPACITY_AUD } from "@/lib/data/policy/au-cost-of-living";
import type { Callout, CalloutStep } from "./types";

export function evaluateWizardCallouts(
  profile: Partial<StudentProfile>,
  step: CalloutStep,
): Callout[] {
  const callouts: Callout[] = [];

  if (step === "fieldOfStudy") {
    if (profile.fieldOfStudy === "nursing" && profile.destination === "australia") {
      callouts.push({
        id: "nursing-ahpra",
        step,
        tone: "info",
        message:
          "Nursing has AHPRA registration requirements. We'll include these in your checklist.",
      });
    }
    if (
      (profile.fieldOfStudy === "computer-science" ||
        profile.fieldOfStudy === "data-science") &&
      profile.destination === "australia"
    ) {
      callouts.push({
        id: "cs-competitive",
        step,
        tone: "info",
        message:
          "CS and Data Science are competitive — grades and English matter more. We'll factor this in.",
      });
    }
  }

  if (step === "graduationYear" && profile.graduationYear !== undefined) {
    const gap = computeGapYears(profile.graduationYear);
    if (gap >= 6) {
      callouts.push({
        id: "long-gap",
        step,
        tone: "warn",
        message:
          "Gaps over 5 years face extra scrutiny. Documented work experience during this period strengthens your case significantly.",
      });
    } else if (gap >= 3) {
      callouts.push({
        id: "moderate-gap",
        step,
        tone: "info",
        message: `A ${gap}-year gap needs a clear explanation for visa purposes. We'll help you frame this.`,
      });
    }
  }

  if (step === "english") {
    if (profile.englishStatus === "taken" && profile.englishScore !== undefined) {
      if (profile.englishScore < 6.5 && profile.destination === "australia") {
        callouts.push({
          id: "ielts-low-au",
          step,
          tone: "warn",
          message:
            "Most Australian universities require 6.5+. You can retake at British Council, Kathmandu.",
          actionLabel: "Find test dates",
          actionHref: "https://www.britishcouncil.org.np/exam/ielts/dates-fees-locations",
        });
      }
    } else if (profile.englishStatus === "not-taken") {
      callouts.push({
        id: "ielts-not-taken",
        step,
        tone: "info",
        message:
          "No score yet? We'll show you what you'd need and where to book in Kathmandu.",
      });
    }
  }

  if (step === "destination" && profile.destination === "not-sure") {
    callouts.push({
      id: "destination-undecided",
      step,
      tone: "info",
      message:
        "Great — we'll compare countries against your profile and show you where you stand best.",
    });
  }

  if (step === "budget") {
    if (profile.fundingSource === "scholarship-dependent") {
      callouts.push({
        id: "scholarship-friendly",
        step,
        tone: "info",
        message:
          "Scholarship-dependent is fine — we'll flag scholarship-friendly universities in your matches.",
      });
    }
    if (profile.budget !== undefined && profile.destination === "australia") {
      // Convert the stated budget to AUD via the single FX source of truth, then
      // compare to the sourced DHA living-capacity figure (A.015/B.002). The old
      // code divided any non-USD budget by 135 (the NPR rate), so a post-MV-97 AUD
      // budget was read as rupees and this warning mis-fired for every student.
      const budgetAud = toAud(profile.budget, profile.budgetCurrency ?? null);
      if (budgetAud < AU_DHA_LIVING_CAPACITY_AUD.value) {
        callouts.push({
          id: "budget-tight-au",
          step,
          tone: "warn",
          message: `Australian living costs alone are about A$${AU_DHA_LIVING_CAPACITY_AUD.value.toLocaleString()}/yr (the DHA financial-capacity figure), before tuition. Consider scholarships or loan support.`,
        });
      }
    }
  }

  return callouts;
}
