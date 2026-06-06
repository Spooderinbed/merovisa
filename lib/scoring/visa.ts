import type { DimensionScore, StudentProfile } from "./types";
import { computeGapYears } from "./gap";
import {
  GAP_REASON_WEIGHT,
  ENGLISH_THRESHOLD_BY_DEST,
  GAP_PENALTIES,
  ENGLISH_NOT_TAKEN_PENALTY,
  ENGLISH_BAND_DELTA_POINTS,
} from "@/lib/data/scoring-config";

export function scoreVisa(profile: StudentProfile): DimensionScore {
  const gap = computeGapYears(profile.graduationYear);

  // Baseline 80; penalise for gap length.
  let score = 80;
  if (gap === 0) {
    score += GAP_PENALTIES.none;
  } else if (gap <= 2) {
    score += GAP_PENALTIES.upTo2;
  } else if (gap <= 5) {
    score += GAP_PENALTIES.upTo5;
  } else {
    score += GAP_PENALTIES.beyond;
  }

  // Gap reason mitigation: average the weights of selected reasons.
  if (gap > 0 && profile.gapReasons.length > 0) {
    const avgWeight =
      profile.gapReasons.reduce((sum, r) => sum + GAP_REASON_WEIGHT[r], 0) /
      profile.gapReasons.length;
    score += (avgWeight - 0.7) * 25;
  }

  // English adjustment if a score was taken.
  const threshold = ENGLISH_THRESHOLD_BY_DEST[profile.destination];
  if (profile.englishStatus === "taken" && profile.englishScore !== undefined) {
    const englishDelta = profile.englishScore - threshold;
    score += englishDelta * ENGLISH_BAND_DELTA_POINTS;
  } else if (profile.englishStatus === "not-taken") {
    score += ENGLISH_NOT_TAKEN_PENALTY;
  }

  const value = Math.max(0, Math.min(100, Math.round(score)));

  const factors: DimensionScore["factors"] = [];

  if (gap === 0) {
    factors.push({
      label: "Recent graduate",
      influence: "positive",
      detail: "No gap — strong timing signal for visa.",
    });
  } else if (gap <= 2 && profile.gapReasons.includes("worked")) {
    factors.push({
      label: `${gap}-year gap explained by work`,
      influence: "neutral",
      detail: "Documented employment mitigates gap concerns.",
    });
  } else if (gap > 5) {
    factors.push({
      label: `${gap}-year gap`,
      influence: "risk",
      detail: "Long gaps face extra scrutiny — strong documentation required.",
    });
  } else if (gap > 0) {
    factors.push({
      label: `${gap}-year gap`,
      influence:
        profile.gapReasons.some((r) => r === "worked" || r === "started-something")
          ? "neutral"
          : "risk",
      detail: "Gap requires a clear explanation in your SOP.",
    });
  }

  if (profile.englishStatus === "taken" && profile.englishScore !== undefined) {
    if (profile.englishScore >= threshold) {
      factors.push({
        label: `IELTS ${profile.englishScore.toFixed(1)}`,
        influence: "positive",
        detail: `Meets the ${threshold} threshold for ${profile.destination}.`,
      });
    } else {
      factors.push({
        label: `IELTS ${profile.englishScore.toFixed(1)}`,
        influence: "risk",
        detail: `Below the ${threshold} threshold for ${profile.destination}.`,
      });
    }
  } else if (profile.englishStatus === "not-taken") {
    factors.push({
      label: "No English test taken",
      influence: "risk",
      detail: "Required for student visa — book a test to strengthen your case.",
    });
  }

  return { value, factors };
}
