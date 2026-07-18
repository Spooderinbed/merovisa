import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ProfileSections } from "@/lib/profiles/sections";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { getProfile } from "@/lib/profiles/repo";
import { getProgram, listAllUniversities } from "@/lib/programs/repo";
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
import { hasSufficientInputs } from "@/lib/matches/sufficiency";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import { buildPrediction } from "./predict";
import { insertPrediction, type PredictionRow } from "./repo";

type DB = SupabaseClient<Database>;

export type FreezeResult =
  | { ok: true; prediction: PredictionRow; created: boolean }
  // 422: the profile carries no verdict-driving input (grade/English/budget all
  // absent), so there is nothing to freeze but a fabricated zero-floored verdict.
  | { ok: false; status: 404 | 409 | 422; error: string };

/**
 * Freeze the per-program prediction for a signed-in user (MV-08, F16).
 *
 * Decision B: the verdict is recomputed from `sectionsToMatchInputs` — the SAME
 * adapter the signed-in matches page uses — so the frozen verdict equals what the
 * user saw (not the anonymous `profileToMatchInputs` baseline). Decision C: the
 * assessment anchor is server-derived from the user's PRIMARY assessment, never
 * the request body (409 if they have none). All reads/writes go through the
 * RLS-scoped client passed in (S4) — the caller derives `owner` from the session.
 *
 * Idempotent: a re-freeze under the same rule_version returns the existing
 * prediction-of-record (created: false) — the first commit is what we predicted.
 */
export async function freezePredictionForProgram(
  db: DB,
  owner: string,
  programId: string,
): Promise<FreezeResult> {
  const primary = await getPrimaryAssessmentForUser(db, owner);
  if (!primary) {
    return { ok: false, status: 409, error: "no primary assessment to anchor the prediction" };
  }

  const program = await getProgram(db, programId);
  if (!program) {
    return { ok: false, status: 404, error: "unknown program" };
  }

  const universities = await listAllUniversities(db);
  const university = universities.find((u) => u.id === program.universityId);
  if (!university) {
    return { ok: false, status: 409, error: "program is missing its university" };
  }

  const profile = await getProfile(db, owner);
  const sections = (profile?.sections as ProfileSections | undefined) ?? {};
  const inputs = sectionsToMatchInputs(sections, { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });

  // Unknown is not zero (audit C-4): buildPrediction runs computeMatch, which floors
  // every unknown input to 0. Freezing that would make a fabricated "Reach" the
  // prediction-of-record for a student who never entered a grade, English score, or
  // budget. Abstain — persist nothing — until there is something real to freeze.
  if (!hasSufficientInputs(inputs)) {
    return {
      ok: false,
      status: 422,
      error: "not enough profile data to freeze a prediction — add your grade, English score, or budget first",
    };
  }

  const frozen = buildPrediction(inputs, program, university);

  const result = await insertPrediction(db, {
    owner,
    assessmentId: primary.id,
    programId,
    verdict: frozen.verdict,
    ruleVersion: frozen.ruleVersion,
    scoreSnapshot: frozen.scoreSnapshot,
  });
  if (!result) {
    return { ok: false, status: 409, error: "could not persist the prediction" };
  }
  return { ok: true, prediction: result.row, created: result.created };
}
