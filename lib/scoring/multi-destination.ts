import type { AssessmentResult, Destination, StudentProfile } from "./types";
import { runAssessment } from "./engine";

/**
 * Compose scores across every distinct destination present in the program set.
 * Returns a map destinationId → AssessmentResult.
 * Pure — no I/O.
 */
export function composeScoresForAllDestinations(
  input: Omit<StudentProfile, "destination">,
  destinations: Destination[],
): Record<string, AssessmentResult> {
  const out: Record<string, AssessmentResult> = {};
  for (const d of destinations) {
    out[d] = runAssessment({ ...input, destination: d } as StudentProfile);
  }
  return out;
}
