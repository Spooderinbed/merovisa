import type { AssessmentResult } from "@/lib/scoring/types";
import type { UniversityMatch } from "@/lib/matching/universities";
import type { IntakeTiming } from "@/lib/timing/intake";
import type { ProfileAccuracy } from "./accuracy";

export interface AssessmentPayload {
  result: AssessmentResult;
  matches: UniversityMatch[];
  matchedCount: number;
  intake: IntakeTiming;
  accuracy: ProfileAccuracy;
  /** Oldest verification date across the scoring config's sourced inputs (F16). Absent on legacy stored payloads. */
  rulesVerified?: string;
}
