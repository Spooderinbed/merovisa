import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { caseWriteColumns } from "@/lib/cases/dual-write";
import { CaseReadError } from "@/lib/cases/errors";
import type { DecisionAuthority, EventType, Gate, Source } from "./types";

type DB = SupabaseClient<Database>;

// Row shapes returned to callers (camelCase). The DB columns are snake_case.
//
// `owner` is nullable from MV-156 on: a consultancy case has no Auth user, so a row can legitimately
// carry `case_id` and no `owner`. Admitted in the type rather than asserted away with `!` — a
// non-null assertion here would re-state "actor equals student" in the one place typecheck would
// never complain about again, which is exactly what Stage 2 exists to remove. Re-keying these
// repositories onto `case_id` is MV-157; this is the minimum honest change.
export interface PredictionRow {
  id: string;
  owner: string | null;
  assessmentId: string;
  programId: string;
  verdict: string;
  ruleVersion: string;
  scoreSnapshot: Json;
  predictedAt: string;
}

export interface AttemptRow {
  id: string;
  owner: string | null;
  predictionId: string;
  programId: string;
  institutionId: string | null;
  intake: string | null;
  externalRef: string | null;
  createdAt: string;
}

export interface EventRow {
  id: string;
  owner: string | null;
  attemptId: string;
  eventType: EventType;
  gate: Gate | null;
  reasonCode: string | null;
  decisionAuthority: DecisionAuthority | null;
  occurredAt: string;
  occurredOn: string | null;
  source: Source;
  detail: Json;
  recordedAt: string;
}

/**
 * Freeze a prediction run. Idempotent: a re-freeze of the same
 * (case, assessment, program, rule_version) collides on the unique constraint —
 * we then return the EXISTING prediction-of-record (created: false) rather than
 * overwriting it (the UPDATE-guard trigger forbids overwrites anyway). A new rule
 * version yields a new row. Insert goes through the RLS-scoped client (S4).
 *
 * Predictions stay INSERT-ONLY. MV-157 introduces no UPDATE here and none may be
 * added: `program_predictions_no_update` calls a SECURITY INVOKER function, so
 * even `service_role` does not bypass it, and there is no UPDATE grant on the
 * table for any role — permanently (spec §4.7). Backfilling `case_id` onto legacy
 * prediction rows was MV-155's, done through a narrowed trigger.
 */
export async function insertPrediction(
  db: DB,
  input: {
    caseId: string;
    assessmentId: string;
    programId: string;
    verdict: string;
    ruleVersion: string;
    scoreSnapshot: Json;
  },
): Promise<{ row: PredictionRow; created: boolean } | null> {
  const ownership = await caseWriteColumns(db, input.caseId);
  if (ownership === null) return null;

  const { data, error } = await db
    .from("program_predictions")
    .insert({
      ...ownership,
      assessment_id: input.assessmentId,
      program_id: input.programId,
      verdict: input.verdict,
      rule_version: input.ruleVersion,
      score_snapshot: input.scoreSnapshot,
    })
    .select("*")
    .single();
  if (!error && data) return { row: mapPrediction(data), created: true };
  if (error?.code === "23505") {
    const { data: existing } = await db
      .from("program_predictions")
      .select("*")
      .eq("case_id", input.caseId)
      .eq("assessment_id", input.assessmentId)
      .eq("program_id", input.programId)
      .eq("rule_version", input.ruleVersion)
      .maybeSingle();
    if (existing) return { row: mapPrediction(existing), created: false };
  }
  return null;
}

/**
 * MV-157 completed here: the four id-keyed reads below now take the
 * already-authorized `caseId` and filter on it.
 *
 * They were the last reads in any migrated repository still selecting a row by a
 * CLIENT-SUPPLIED id with no case predicate, relying on "RLS scopes to the owner"
 * as the whole gate. Two things are wrong with that as the resting state. First,
 * the comment describes a policy MV-159 is about to REPLACE — the moment the
 * owner predicate leaves, these become unscoped reads of an id the caller chose,
 * in a card that is not looking at this file. Second, it is the "authorized
 * after reading" shape MV-157 §A exists to remove: the route authorizes a case,
 * then reads a row that has nothing to do with that case, then writes against the
 * row's ids. Passing the case makes the read's scope the same scope the route
 * authorized, and it does so while the legacy policy is still there to catch a
 * mistake rather than after it is gone.
 */
export async function getPredictionById(
  db: DB,
  id: string,
  caseId: string,
): Promise<PredictionRow | null> {
  const { data, error } = await db
    .from("program_predictions")
    .select("*")
    .eq("id", id)
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new CaseReadError("program_predictions", error);
  if (!data) return null;
  return mapPrediction(data);
}

/**
 * Open an application attempt against a frozen prediction. `programId` is taken
 * from the prediction (not the client) so the attempt can't drift from what was
 * predicted.
 *
 * TWO composite FKs guard the chain through Stage 2: the legacy
 * `(prediction_id, owner)` and MV-156's `(prediction_id, case_id)`. Both are
 * MATCH SIMPLE, so a composite FK containing a NULL is satisfied with no lookup
 * at all — which means the CASE chain enforces nothing while `case_id` is
 * nullable, and the retained OWNER chain is what actually bites until MV-160's
 * `SET NOT NULL` (spec §4.7/§4.8). Keeping the dual-write is therefore load-
 * bearing here, not merely tidy.
 */
export async function insertAttempt(
  db: DB,
  input: {
    caseId: string;
    predictionId: string;
    programId: string;
    institutionId?: string | null;
    intake?: string | null;
    externalRef?: string | null;
  },
): Promise<AttemptRow | null> {
  const ownership = await caseWriteColumns(db, input.caseId);
  if (ownership === null) return null;

  const { data, error } = await db
    .from("application_attempts")
    .insert({
      ...ownership,
      prediction_id: input.predictionId,
      program_id: input.programId,
      institution_id: input.institutionId ?? null,
      intake: input.intake ?? null,
      external_ref: input.externalRef ?? null,
    })
    .select("*")
    .single();
  if (error || !data) return null;
  return mapAttempt(data);
}

export async function getAttemptById(db: DB, id: string, caseId: string): Promise<AttemptRow | null> {
  const { data, error } = await db
    .from("application_attempts")
    .select("*")
    .eq("id", id)
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new CaseReadError("application_attempts", error);
  if (!data) return null;
  return mapAttempt(data);
}

/** Attempts already opened against a prediction (used to keep the apply hook idempotent). */
export async function listAttemptsForPrediction(
  db: DB,
  predictionId: string,
  caseId: string,
): Promise<AttemptRow[]> {
  const { data, error } = await db
    .from("application_attempts")
    .select("*")
    .eq("prediction_id", predictionId)
    .eq("case_id", caseId);
  if (error) throw new CaseReadError("application_attempts", error);
  return (data ?? []).map(mapAttempt);
}

/**
 * Event types already on the attempt — the input to the funnel state machine (S7).
 *
 * The case filter matters MORE here than on a plain read: an empty list is what
 * tells the state machine a transition has not happened yet, so a wrongly-empty
 * answer re-files an event the student already filed.
 */
export async function listEventTypesForAttempt(
  db: DB,
  attemptId: string,
  caseId: string,
): Promise<EventType[]> {
  const { data, error } = await db
    .from("outcome_events")
    .select("event_type")
    .eq("attempt_id", attemptId)
    .eq("case_id", caseId);
  if (error) throw new CaseReadError("outcome_events", error);
  return (data ?? []).map((r) => r.event_type as EventType);
}

/**
 * Append a funnel event. gate/decision_authority/source are derived server-side
 * (B3) and passed in; RLS additionally forces source='self_reported' + verified_by
 * null on this path, so a user can only file unverified self-reports.
 */
export async function insertEvent(
  db: DB,
  input: {
    caseId: string;
    attemptId: string;
    eventType: EventType;
    gate: Gate | null;
    decisionAuthority: DecisionAuthority | null;
    source: Source;
    reasonCode?: string | null;
    occurredAt: string;
    occurredOn?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<EventRow | null> {
  const ownership = await caseWriteColumns(db, input.caseId);
  if (ownership === null) return null;

  const { data, error } = await db
    .from("outcome_events")
    .insert({
      ...ownership,
      attempt_id: input.attemptId,
      event_type: input.eventType,
      gate: input.gate,
      reason_code: input.reasonCode ?? null,
      decision_authority: input.decisionAuthority,
      occurred_at: input.occurredAt,
      occurred_on: input.occurredOn ?? null,
      source: input.source,
      // Zod-validated record → JSON column (trusted JSON-serializable at this boundary).
      detail: (input.detail ?? {}) as Json,
    })
    .select("*")
    .single();
  if (error || !data) return null;
  return mapEvent(data);
}

/** The case's full outcome history. */
export async function getOutcomesForCase(
  db: DB,
  caseId: string,
): Promise<{ predictions: PredictionRow[]; attempts: AttemptRow[]; events: EventRow[] }> {
  const [p, a, e] = await Promise.all([
    db.from("program_predictions").select("*").eq("case_id", caseId),
    db.from("application_attempts").select("*").eq("case_id", caseId),
    db.from("outcome_events").select("*").eq("case_id", caseId),
  ]);
  // MV-133 on the case axis. None of these three destructured `error`, so a
  // failed read rendered as "no applications tracked" — the same screen a student
  // who has tracked none sees, on the surface where they went to check whether
  // their offer was recorded.
  if (p.error) throw new CaseReadError("program_predictions", p.error);
  if (a.error) throw new CaseReadError("application_attempts", a.error);
  if (e.error) throw new CaseReadError("outcome_events", e.error);
  return {
    predictions: (p.data ?? []).map(mapPrediction),
    attempts: (a.data ?? []).map(mapAttempt),
    events: (e.data ?? []).map(mapEvent),
  };
}

type PredictionDbRow = Database["public"]["Tables"]["program_predictions"]["Row"];
type AttemptDbRow = Database["public"]["Tables"]["application_attempts"]["Row"];
type EventDbRow = Database["public"]["Tables"]["outcome_events"]["Row"];

function mapPrediction(r: PredictionDbRow): PredictionRow {
  return {
    id: r.id,
    owner: r.owner,
    assessmentId: r.assessment_id,
    programId: r.program_id,
    verdict: r.verdict,
    ruleVersion: r.rule_version,
    scoreSnapshot: r.score_snapshot,
    predictedAt: r.predicted_at,
  };
}

function mapAttempt(r: AttemptDbRow): AttemptRow {
  return {
    id: r.id,
    owner: r.owner,
    predictionId: r.prediction_id,
    programId: r.program_id,
    institutionId: r.institution_id,
    intake: r.intake,
    externalRef: r.external_ref,
    createdAt: r.created_at,
  };
}

function mapEvent(r: EventDbRow): EventRow {
  return {
    id: r.id,
    owner: r.owner,
    attemptId: r.attempt_id,
    eventType: r.event_type as EventType,
    gate: r.gate as Gate | null,
    reasonCode: r.reason_code,
    decisionAuthority: r.decision_authority as DecisionAuthority | null,
    occurredAt: r.occurred_at,
    occurredOn: r.occurred_on,
    source: r.source as Source,
    detail: r.detail,
    recordedAt: r.recorded_at,
  };
}
