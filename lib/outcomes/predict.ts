// MV-08 — server-side prediction freeze (F16).
// Recomputes the per-program verdict and returns the immutable snapshot to store
// in program_predictions. Reuses the existing match engine (lib/matches/compute)
// so a frozen prediction is identical to what the matches surface showed — never
// trusts a client-supplied verdict/snapshot.
//
// Adapter-agnostic: the CALLER chooses how to build the MatchInputs. The signed-in
// freeze path MUST use `sectionsToMatchInputs` (the same adapter the signed-in
// matches page uses) so the frozen verdict equals what the user saw — NOT the
// anonymous `profileToMatchInputs`, whose provisional English baseline (booked→6.5,
// not-taken→6.0) would store a more optimistic verdict than the page rendered.
//
// The verdict and the { gradeGap, englishGap, bandGap, tuitionGap } snapshot are
// per-program (the matches path), NOT the corridor-level runAssessment verdict.

import { computeMatch } from "@/lib/matches/compute";
import { RULE_VERSION } from "@/lib/scoring/engine";
import type { MatchInputs, MatchResult, MatchVerdict } from "@/lib/matches/types";
import type { Program, University } from "@/lib/programs/types";

export interface FrozenPrediction {
  verdict: MatchVerdict;
  scoreSnapshot: MatchResult["scoreSnapshot"];
  ruleVersion: string;
}

export function buildPrediction(
  inputs: MatchInputs,
  program: Program,
  university: University,
): FrozenPrediction {
  const match = computeMatch(inputs, program, university);
  if (!match) {
    throw new Error(`cannot build a prediction for program ${program.id}: missing university`);
  }
  return {
    verdict: match.verdict,
    scoreSnapshot: match.scoreSnapshot,
    ruleVersion: RULE_VERSION,
  };
}
