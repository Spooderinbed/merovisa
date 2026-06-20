// MV-08 — server-side prediction freeze (F16).
// Recomputes the per-program verdict from the student's profile + the program
// they are committing to, and returns the immutable snapshot to store in
// program_predictions. Reuses the existing match engine (lib/matches/compute) so
// a frozen prediction is identical to what the matches surface showed — never
// trusts a client-supplied verdict/snapshot. The verdict and the
// { gradeGap, englishGap, bandGap, tuitionGap } snapshot are per-program (the
// matches path), NOT the corridor-level runAssessment verdict.

import { computeMatch } from "@/lib/matches/compute";
import { profileToMatchInputs } from "@/lib/matches/from-student-profile";
import { RULE_VERSION } from "@/lib/scoring/engine";
import type { MatchResult, MatchVerdict } from "@/lib/matches/types";
import type { Program, University } from "@/lib/programs/types";
import type { StudentProfile } from "@/lib/scoring/types";

export interface FrozenPrediction {
  verdict: MatchVerdict;
  scoreSnapshot: MatchResult["scoreSnapshot"];
  ruleVersion: string;
}

export function buildPrediction(
  profile: StudentProfile,
  program: Program,
  university: University,
): FrozenPrediction {
  const match = computeMatch(profileToMatchInputs(profile), program, university);
  if (!match) {
    throw new Error(`cannot build a prediction for program ${program.id}: missing university`);
  }
  return {
    verdict: match.verdict,
    scoreSnapshot: match.scoreSnapshot,
    ruleVersion: RULE_VERSION,
  };
}
