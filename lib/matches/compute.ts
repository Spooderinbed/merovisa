import type { Program, University } from "@/lib/programs/types";
import type { MatchResult, MatchInputs, MatchReason } from "./types";

export function computeMatches(
  inputs: MatchInputs,
  programs: Program[],
  universities: University[],
): MatchResult[] {
  const uniById = new Map(universities.map((u) => [u.id, u]));
  const eligible = filterByLevel(programs, inputs.userTargetLevel);
  return rankByField(eligible, inputs.userField)
    .map((p) => computeOne(inputs, p, uniById.get(p.universityId)))
    .filter((m): m is MatchResult => m !== null);
}

/**
 * Eligibility pre-filter: keep only programs at the user's target level. The
 * filter is HARD because surfacing a wrong-level program (e.g. bachelors to a
 * bachelors-holder) is actively misleading. Skipped when the target level is
 * unknown. Defensive fallback: if the filter would empty the list, the
 * unfiltered set is returned so the user never sees an empty page due to filtering.
 */
function filterByLevel(programs: Program[], target: MatchInputs["userTargetLevel"]): Program[] {
  if (!target) return programs;
  const matched = programs.filter((p) => p.level === target);
  return matched.length > 0 ? matched : programs;
}

/**
 * Field is a SOFT rule: same-field programs sort first, everything else keeps its
 * original relative order. We do not hard-filter by field — only 6 fields exist in
 * the catalogue and several field×level cells are empty, so a hard filter would
 * empty the list for many users. This guarantees a non-empty, field-relevant list.
 */
function rankByField(programs: Program[], field: MatchInputs["userField"]): Program[] {
  if (!field) return programs;
  // Stable partition: same-field first, preserving input order within each group.
  const sameField = programs.filter((p) => p.field === field);
  const rest = programs.filter((p) => p.field !== field);
  return [...sameField, ...rest];
}

/**
 * Compute the match result for ONE program, bypassing the level/field list passes.
 * Used to freeze a prediction for a program the student is committing to (MV-08)
 * even when it is a reach or off-level — the eligibility filter that
 * `computeMatches` applies to a browse list must NOT hide it here. Returns null
 * only when the university is missing (mirrors `computeOne`).
 */
export function computeMatch(
  inputs: MatchInputs,
  program: Program,
  university: University | undefined,
): MatchResult | null {
  return computeOne(inputs, program, university);
}

function computeOne(
  inputs: MatchInputs,
  p: Program,
  u: University | undefined,
): MatchResult | null {
  if (!u) return null;

  const userGrade = inputs.userGradePercent ?? 0;
  const userOverall = inputs.userEnglishOverall ?? 0;
  const userBand = inputs.userEnglishBand ?? userOverall;
  const budget = inputs.userBudgetAud ?? 0;

  const minGrade = p.minGrade ?? 0;
  const minEnglish = p.minEnglish ?? 0;
  const minBand = p.minEnglishBand ?? minEnglish;
  const tuitionMin = p.tuitionMin ?? 0;

  const gradeGap = Math.max(0, minGrade - userGrade);
  const englishGap = Math.max(0, minEnglish - userOverall);
  const bandGap = userBand < minBand ? minBand - userBand : 0;
  const tuitionGap = Math.max(0, tuitionMin - budget);

  let verdict: "strong" | "possible" | "reach";
  if (gradeGap === 0 && englishGap === 0 && bandGap === 0 && tuitionGap === 0) {
    verdict = "strong";
  } else if (
    gradeGap > 10 ||
    englishGap > 1 ||
    (tuitionMin > 0 && tuitionGap / tuitionMin > 0.5)
  ) {
    verdict = "reach";
  } else {
    verdict = "possible";
  }

  const reasons: MatchReason[] = [];

  if (gradeGap === 0) {
    reasons.push({
      kind: "academic",
      text: `Your ${userGrade}% meets the ${minGrade}% minimum.`,
      positive: true,
    });
  } else {
    reasons.push({
      kind: "academic",
      text: `Grade short by ${gradeGap.toFixed(0)}% (needs ${minGrade}%).`,
      positive: false,
    });
  }

  if (englishGap === 0) {
    reasons.push({
      kind: "english",
      text: `IELTS ${userOverall} meets ${minEnglish} overall.`,
      positive: true,
    });
  } else {
    reasons.push({
      kind: "english",
      text: `IELTS overall short by ${englishGap.toFixed(1)} (needs ${minEnglish}).`,
      positive: false,
    });
  }

  if (bandGap > 0) {
    reasons.push({
      kind: "english-band",
      text: `Per-band short by ${bandGap.toFixed(1)} (needs each band ≥ ${minBand}).`,
      positive: false,
    });
  }

  if (tuitionGap === 0 && budget > 0) {
    reasons.push({
      kind: "tuition",
      text: `Budget covers AUD ${tuitionMin.toLocaleString()} tuition.`,
      positive: true,
    });
  } else if (tuitionGap > 0) {
    reasons.push({
      kind: "tuition",
      text: `Budget below tuition by AUD ${Math.round(tuitionGap).toLocaleString()}.`,
      positive: false,
    });
  }

  if (inputs.policy.nepalAssessmentLevel === "L3") {
    reasons.push({
      kind: "policy",
      text: "Genuine Student narrative + 6 months bank seasoning expected (Nepal AL3).",
      positive: false,
    });
  }

  if (inputs.userField && p.field === inputs.userField) {
    reasons.push({
      kind: "field",
      text: `Aligned with your intended field (${inputs.userField}).`,
      positive: true,
    });
  }

  return {
    program: p,
    university: u,
    verdict,
    reasons,
    scoreSnapshot: { gradeGap, englishGap, bandGap, tuitionGap },
  };
}
