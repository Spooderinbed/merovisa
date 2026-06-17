import type { DimensionScore, StudentProfile } from "./types";
import { computeGapYears } from "./gap";
import { toIeltsEquivalent } from "./english-equivalent";
import {
  GAP_REASON_WEIGHT,
  ENGLISH_THRESHOLD_BY_DEST,
  ENGLISH_VISA_FLOOR_BY_DEST,
  GAP_PENALTIES,
  ENGLISH_NOT_TAKEN_PENALTY,
  ENGLISH_BAND_DELTA_POINTS,
  CONFIG_PROVENANCE,
} from "@/lib/data/scoring-config";

// Prior student-visa refusals are one of the strongest real-world DHA Subclass
// 500 risk factors, so the visa dimension applies a flat, rule-level penalty
// (versioned by RULE_VERSION, not the sourced-config layer — it's a scoring rule,
// not an externally-sourced figure). Magnitudes are an internal heuristic: one
// refusal is a yellow flag, multiple is a serious credibility problem.
const REFUSAL_VISA_PENALTY: Record<"one" | "multiple", number> = { one: -15, multiple: -35 };

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
  // Convert the raw test score to its IELTS-band equivalent so PTE/TOEFL are
  // compared against the IELTS-denominated DHA thresholds (undefined test ⇒ IELTS).
  const threshold = ENGLISH_THRESHOLD_BY_DEST[profile.destination];
  const visaFloor = ENGLISH_VISA_FLOOR_BY_DEST[profile.destination];
  const ieltsScore =
    profile.englishScore !== undefined
      ? toIeltsEquivalent(profile.englishScore, profile.englishTest)
      : undefined;
  if (profile.englishStatus === "taken" && ieltsScore !== undefined) {
    if (ieltsScore >= threshold || ieltsScore < visaFloor) {
      score += (ieltsScore - threshold) * ENGLISH_BAND_DELTA_POINTS;
    }
    // [visaFloor, threshold): meets the visa floor → no adjustment.
  } else if (profile.englishStatus === "not-taken") {
    score += ENGLISH_NOT_TAKEN_PENALTY;
  }

  // Prior visa refusals (declared in the immigration section) lower the case.
  const refusals = profile.priorRefusals;
  if (refusals === "one" || refusals === "multiple") {
    score += REFUSAL_VISA_PENALTY[refusals];
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

  if (profile.englishStatus === "taken" && ieltsScore !== undefined) {
    const floorProv = CONFIG_PROVENANCE.ENGLISH_VISA_FLOOR_BY_DEST;
    const floorUrl = floorProv?.source;
    const floorSource = floorUrl ? { url: floorUrl, lastVerified: floorProv?.lastVerified } : undefined;
    const ielts = `IELTS ${ieltsScore.toFixed(1)}`;
    if (ieltsScore >= threshold) {
      factors.push({
        label: ielts,
        influence: "positive",
        detail: `Meets the ${threshold} threshold for ${profile.destination}.`,
      });
    } else if (ieltsScore >= visaFloor) {
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

  if (refusals === "one") {
    factors.push({
      label: "One prior visa refusal",
      influence: "risk",
      detail:
        "A previous refusal is a factor officers weigh — address it directly with a clear, well-documented explanation.",
    });
  } else if (refusals === "multiple") {
    factors.push({
      label: "Multiple prior visa refusals",
      influence: "risk",
      detail:
        "Repeat refusals carry real weight — a strong, well-evidenced Genuine Student case is essential to move forward.",
    });
  }

  return { value, factors };
}
