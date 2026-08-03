import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { freezePredictionForProgram } from "./freeze";
import { eventDecisionAuthority, eventGate } from "./events";
import {
  insertAttempt,
  insertEvent,
  listAttemptsForPrediction,
  listEventTypesForAttempt,
  type AttemptRow,
} from "./repo";

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
  caseId: string,
  programId: string,
): Promise<CaptureResult> {
  const frozen = await freezePredictionForProgram(db, caseId, programId);
  if (!frozen.ok) return { captured: false, reason: frozen.error };

  const [existing] = await listAttemptsForPrediction(db, frozen.prediction.id, caseId);
  if (existing) {
    await ensureAppliedEvent(db, caseId, existing);
    return { captured: true, attempt: existing, created: false };
  }

  const attempt = await insertAttempt(db, {
    caseId,
    predictionId: frozen.prediction.id,
    programId: frozen.prediction.programId,
  });
  if (!attempt) return { captured: false, reason: "could not open the attempt" };
  await ensureAppliedEvent(db, caseId, attempt);
  return { captured: true, attempt, created: true };
}

/**
 * Write the funnel's root 'applied' event for an attempt, idempotently. Without
 * it the state machine (S7) rejects the first self-report (offer/refusal) as
 * "not valid before the application is recorded" (409) — so opening an attempt
 * without this event dead-ends the funnel. Mirrors /api/outcomes/event: gate,
 * decision authority, and source are derived server-side (B3), never asserted by
 * the client. Anchored to the attempt's open time so the root is deterministic.
 * Skips the write if an 'applied' event is already present, which also repairs
 * attempts opened by the earlier event-less path.
 */
async function ensureAppliedEvent(db: DB, caseId: string, attempt: AttemptRow): Promise<void> {
  const prior = await listEventTypesForAttempt(db, attempt.id, caseId);
  if (prior.includes("applied")) return;
  await insertEvent(db, {
    caseId,
    attemptId: attempt.id,
    eventType: "applied",
    gate: eventGate("applied"),
    decisionAuthority: eventDecisionAuthority("applied"),
    source: "self_reported",
    occurredAt: attempt.createdAt,
  });
}
