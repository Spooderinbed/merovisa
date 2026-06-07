import type { DimensionScore, StudentProfile } from "./types";
import { computeGapYears } from "./gap";
import {
  GAP_REASON_WEIGHT,
  ENGLISH_THRESHOLD_BY_DEST,
  ENGLISH_VISA_FLOOR_BY_DEST,
  GAP_PENALTIES,
  ENGLISH_NOT_TAKEN_PENALTY,
  ENGLISH_BAND_DELTA_POINTS,
  CONFIG_PROVENANCE,
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

  // English adjustment. The DHA *visa* floor (e.g. IELTS 6.0) is distinct from the
  // *course* threshold (6.5): a visa-valid score in [floor, threshold) is neither
  // rewarded nor penalised; above the threshold earns the per-band bonus, and only
  // below the visa floor is a real risk (the same threshold-anchored curve as before).
  const threshold = ENGLISH_THRESHOLD_BY_DEST[profile.destination];
  const visaFloor = ENGLISH_VISA_FLOOR_BY_DEST[profile.destination];
  if (profile.englishStatus === "taken" && profile.englishScore !== undefined) {
    if (profile.englishScore >= threshold || profile.englishScore < visaFloor) {
      score += (profile.englishScore - threshold) * ENGLISH_BAND_DELTA_POINTS;
    }
    // [visaFloor, threshold): meets the visa floor → no adjustment.
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
    const floorProv = CONFIG_PROVENANCE.ENGLISH_VISA_FLOOR_BY_DEST;
    const floorUrl = floorProv?.source;
    const floorSource = floorUrl ? { url: floorUrl, lastVerified: floorProv?.lastVerified } : undefined;
    const ielts = `IELTS ${profile.englishScore.toFixed(1)}`;
    if (profile.englishScore >= threshold) {
      factors.push({
        label: ielts,
        influence: "positive",
        detail: `Meets the ${threshold} threshold for ${profile.destination}.`,
      });
    } else if (profile.englishScore >= visaFloor) {
      factors.push({
        label: ielts,
        influence: "neutral",
        detail: `Meets the DHA visa floor (${visaFloor.toFixed(1)}); below the ${threshold} course preference.`,
        source: floorSource,
      });
    } else {
      factors.push({
        label: ielts,
        influence: "risk",
        detail: `Below the DHA visa floor (${visaFloor.toFixed(1)}) for ${profile.destination}.`,
        source: floorSource,
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
