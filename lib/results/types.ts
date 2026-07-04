import type { AssessmentResult } from "@/lib/scoring/types";
import type { MatchResult, PreferenceNote } from "@/lib/matches/types";
import type { IntakeTiming } from "@/lib/timing/intake";
import type { FieldCompetitivenessNote } from "@/lib/scoring/field-note";
import type { SecondaryVerdicts } from "./secondary-verdicts";
import type { ProfileAccuracy } from "./accuracy";

export interface AssessmentPayload {
  result: AssessmentResult;
  matches: MatchResult[];
  matchedCount: number;
  intake: IntakeTiming;
  accuracy: ProfileAccuracy;
  /** Oldest verification date across the scoring config's sourced inputs (F16). Absent on legacy stored payloads. */
  rulesVerified?: string;
  /** A scoring-critical input is past its reverifyBy as of scoring time — the verdict card degrades (MV-04). Absent on legacy stored payloads. */
  rulesStale?: boolean;
  /** How the chosen goal shaped the match order. Absent on legacy stored payloads. */
  preferenceNote?: PreferenceNote | null;
  /** Honest context when an "also considering" field's admission bar differs materially from the primary the verdict was scored on (MV-101). Never changes the score. Absent on legacy stored payloads. */
  competitivenessNote?: FieldCompetitivenessNote | null;
  /** Banded verdicts for each "also considering" field, re-scored server-side (Option C / MV-102).
   *  Null when no extras or on legacy stored payloads. Never affects the primary verdict. */
  secondaryVerdicts?: SecondaryVerdicts | null;
}
