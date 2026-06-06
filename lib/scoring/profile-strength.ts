import type { DimensionScore, StudentProfile } from "./types";
import { PROFILE_STRENGTH_POINTS } from "@/lib/data/scoring-config";

export function scoreProfileStrength(profile: StudentProfile): DimensionScore {
  let score = PROFILE_STRENGTH_POINTS.base;

  if (profile.educationLevel === "masters") score += PROFILE_STRENGTH_POINTS.masters;
  else if (profile.educationLevel === "bachelors") score += PROFILE_STRENGTH_POINTS.bachelors;

  const hasWork = profile.gapReasons.includes("worked");
  const hasOwnVenture = profile.gapReasons.includes("started-something");
  if (hasWork) score += PROFILE_STRENGTH_POINTS.work;
  if (hasOwnVenture) score += PROFILE_STRENGTH_POINTS.venture;

  if (profile.englishStatus === "taken" && profile.englishScore !== undefined) {
    if (profile.englishScore >= 7.5) score += PROFILE_STRENGTH_POINTS.english75;
    else if (profile.englishScore >= 7.0) score += PROFILE_STRENGTH_POINTS.english70;
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

  if (
    profile.englishStatus === "taken" &&
    profile.englishScore !== undefined &&
    profile.englishScore >= 7.5
  ) {
    factors.push({
      label: `Strong English (${profile.englishScore.toFixed(1)})`,
      influence: "positive",
      detail: "High IELTS opens up more selective programs.",
    });
  }

  return { value, factors };
}
