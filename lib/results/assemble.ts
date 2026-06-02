import type { StudentProfile } from "@/lib/scoring/types";
import { runAssessment } from "@/lib/scoring/engine";
import { matchUniversities } from "@/lib/matching/universities";
import { computeIntakeTiming } from "@/lib/timing/intake";
import { computeProfileAccuracy } from "./accuracy";
import { AUSTRALIA } from "@/lib/data/destination/australia";
import type { AssessmentPayload } from "./types";

// MVP: every corridor resolves to Australia data. "not-sure" and other
// destinations default to Australia with a "more countries coming" note in the UI.
export function assembleAssessment(profile: StudentProfile, now: Date = new Date()): AssessmentPayload {
  const matches = matchUniversities(profile);
  return {
    result: runAssessment(profile),
    matches,
    matchedCount: matches.length,
    intake: computeIntakeTiming(profile, AUSTRALIA, now),
    accuracy: computeProfileAccuracy(profile),
  };
}
