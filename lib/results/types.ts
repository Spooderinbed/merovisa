import type { AssessmentResult } from "@/lib/scoring/types";
import type { MatchResult, PreferenceNote } from "@/lib/matches/types";
import type { IntakeTiming } from "@/lib/timing/intake";
import type { FieldCompetitivenessNote } from "@/lib/scoring/field-note";
import type { GoalTradeoffNote } from "@/lib/goals/conflicts";
import type { SecondaryVerdicts } from "./secondary-verdicts";
import type { ProfileCompleteness } from "./completeness";

export interface AssessmentPayload {
  result: AssessmentResult;
  matches: MatchResult[];
  matchedCount: number;
  intake: IntakeTiming;
  /**
   * Honest weighted profile-COMPLETENESS (how much of the picture the student gave us),
   * NOT a confidence/accuracy score — see lib/results/completeness.ts. The field key is
   * kept as `accuracy` because the whole payload is persisted into assessments.result;
   * renaming the stored key would break the meter for every already-saved assessment.
   */
  accuracy: ProfileCompleteness;
  /** Oldest verification date across the scoring config's sourced inputs (F16). Absent on legacy stored payloads. */
  rulesVerified?: string;
  /** A scoring-critical input is past its reverifyBy as of scoring time — the verdict card degrades (MV-04). Absent on legacy stored payloads. */
  rulesStale?: boolean;
  /** How the chosen goal shaped the match order. Absent on legacy stored payloads. */
  preferenceNote?: PreferenceNote | null;
  /** Honest context when an "also considering" field's admission bar differs materially from the primary the verdict was scored on (MV-101). Never changes the score. Absent on legacy stored payloads. */
  competitivenessNote?: FieldCompetitivenessNote | null;
  /**
   * Honest note when the primary goal and a secondary goal pull in different
   * directions (lib/goals/conflicts.ts). Score-inert and order-inert — display
   * only. Absent/null when nothing tensions.
   */
  goalTradeoffNote?: GoalTradeoffNote | null;
  /** Banded verdicts for each "also considering" field, re-scored server-side (Option C / MV-102).
   *  Null when no extras or on legacy stored payloads. Never affects the primary verdict. */
  secondaryVerdicts?: SecondaryVerdicts | null;
  /**
   * The student's intended field id when the catalogue carries no programs for it, so the
   * results page can say plainly we don't list it yet instead of presenting off-field
   * programs as their matches (audit C-10). Absent/null when the field is covered. Never
   * affects the verdict or the match list — display only.
   */
  fieldCoverageNotice?: string | null;
}
