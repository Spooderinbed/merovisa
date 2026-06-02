import type { DimensionScore, StudentProfile } from "./types";

export function scoreProfileStrength(profile: StudentProfile): DimensionScore {
  let score = 55;

  if (profile.educationLevel === "masters") score += 18;
  else if (profile.educationLevel === "bachelors") score += 8;

  const hasWork = profile.gapReasons.includes("worked");
  const hasOwnVenture = profile.gapReasons.includes("started-something");
  if (hasWork) score += 10;
  if (hasOwnVenture) score += 6;

  if (profile.englishStatus === "taken" && profile.englishScore !== undefined) {
    if (profile.englishScore >= 7.5) score += 8;
    else if (profile.englishScore >= 7.0) score += 5;
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
