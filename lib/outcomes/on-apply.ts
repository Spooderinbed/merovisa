import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { freezePredictionForProgram } from "./freeze";
import { insertAttempt, listAttemptsForPrediction, type AttemptRow } from "./repo";

type DB = SupabaseClient<Database>;

export type CaptureResult =
  | { captured: true; attempt: AttemptRow; created: boolean }
  | { captured: false; reason: string };

/**
 * The moat capture fired when a student marks a program 'applied' (MV-08).
 * Freezes the prediction-of-record (idempotent) and opens an application attempt.
 * Idempotent end-to-end: a repeat 'applied' flip returns the existing attempt
 * rather than spawning a duplicate. Best-effort — the caller must NOT fail the
 * shortlist write if capture fails (e.g. the user has no primary assessment yet).
 * Runs entirely through the RLS-scoped client passed in (S4).
 */
export async function captureApplication(
  db: DB,
  owner: string,
  programId: string,
): Promise<CaptureResult> {
  const frozen = await freezePredictionForProgram(db, owner, programId);
  if (!frozen.ok) return { captured: false, reason: frozen.error };

  const [existing] = await listAttemptsForPrediction(db, frozen.prediction.id);
  if (existing) return { captured: true, attempt: existing, created: false };

  const attempt = await insertAttempt(db, {
    owner,
    predictionId: frozen.prediction.id,
    programId: frozen.prediction.programId,
  });
  if (!attempt) return { captured: false, reason: "could not open the attempt" };
  return { captured: true, attempt, created: true };
}
