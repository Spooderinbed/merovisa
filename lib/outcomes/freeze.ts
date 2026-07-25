import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ProfileSections } from "@/lib/profiles/sections";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { getProfile } from "@/lib/profiles/repo";
import { getProgram, listAllUniversities } from "@/lib/programs/repo";
import { isCatalogReadError } from "@/lib/programs/errors";
import type { Program, University } from "@/lib/programs/types";
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
  // 503: the catalogue could not be read at all — distinct from the 404/409 below,
  // which are answers about a catalogue that DID respond (MV-133).
  | { ok: false; status: 404 | 409 | 422 | 503; error: string };

/**
 * A catalogue outage is not a verdict about the program. Without this, a failed read
 * surfaces as "unknown program" (404) or "program is missing its university" (409) —
 * both of which tell the student their shortlisted program is broken or gone. Anything
 * that is not a catalogue read error is a real bug and keeps propagating.
 */
function catalogueOutage(err: unknown, context: Record<string, unknown>): FreezeResult {
  if (!isCatalogReadError(err)) throw err;
  console.error("[outcomes/freeze] catalogue read failed", { ...context, err });
  return {
    ok: false,
    status: 503,
    error: "the program catalogue is unavailable right now — try again in a moment",
  };
}

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

  let program: Program | null;
  try {
    program = await getProgram(db, programId);
  } catch (err) {
    return catalogueOutage(err, { owner, programId });
  }
  if (!program) {
    return { ok: false, status: 404, error: "unknown program" };
  }

  let universities: University[];
  try {
    universities = await listAllUniversities(db);
  } catch (err) {
    return catalogueOutage(err, { owner, programId });
  }
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
