import type { DimensionScore, StudentProfile } from "./types";
import { PROFILE_STRENGTH_POINTS } from "@/lib/data/scoring-config";
import { toIeltsEquivalent } from "./english-equivalent";

export function scoreProfileStrength(profile: StudentProfile): DimensionScore {
  let score = PROFILE_STRENGTH_POINTS.base;

  if (profile.educationLevel === "masters") score += PROFILE_STRENGTH_POINTS.masters;
  else if (profile.educationLevel === "bachelors") score += PROFILE_STRENGTH_POINTS.bachelors;

  const hasWork = profile.gapReasons.includes("worked");
  const hasOwnVenture = profile.gapReasons.includes("started-something");
  if (hasWork) score += PROFILE_STRENGTH_POINTS.work;
  if (hasOwnVenture) score += PROFILE_STRENGTH_POINTS.venture;

  // englishScore is in the test's OWN scale (a PTE 58, a TOEFL 79); compare on the IELTS
  // band it concords to, never the raw number, or a raw PTE 58 reads as ">= 7.5" and
  // over-awards every PTE/TOEFL taker. Omitted test ⇒ IELTS, so IELTS data is unchanged.
  const englishBand =
    profile.englishStatus === "taken" && profile.englishScore !== undefined
      ? toIeltsEquivalent(profile.englishScore, profile.englishTest)
      : undefined;

  if (englishBand !== undefined) {
    if (englishBand >= 7.5) score += PROFILE_STRENGTH_POINTS.english75;
    else if (englishBand >= 7.0) score += PROFILE_STRENGTH_POINTS.english70;
  }

  const value = Math.max(0, Math.min(100, Math.round(score)));

  const factors: DimensionScore["factors"] = [];

  if (profile.educationLevel === "masters") {
    factors.push({
      label: "Master's degree",
      influence: "positive",
      detail: "Postgraduate level strengthens profile.",
    });
  } else if (profile.educationLevel === "higher-secondary") {
    factors.push({
      label: "Higher secondary only",
      influence: "neutral",
      detail: "A completed bachelor's would significantly improve standing.",
    });
  }

  if (hasWork) {
    factors.push({
      label: "Work experience",
      influence: "positive",
      detail: "Documented employment strengthens both profile and visa case.",
    });
  }

  if (englishBand !== undefined && englishBand >= 7.5) {
    factors.push({
      label: `Strong English (${englishBand.toFixed(1)})`,
      influence: "positive",
      detail: "High IELTS opens up more selective programs.",
    });
  }

  return { value, factors };
}
