import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { DecisionAuthority, EventType, Gate, Source } from "./types";

type DB = SupabaseClient<Database>;

// Row shapes returned to callers (camelCase). The DB columns are snake_case.
export interface PredictionRow {
  id: string;
  owner: string;
  assessmentId: string;
  programId: string;
  verdict: string;
  ruleVersion: string;
  scoreSnapshot: Json;
  predictedAt: string;
}

export interface AttemptRow {
  id: string;
  owner: string;
  predictionId: string;
  programId: string;
  institutionId: string | null;
  intake: string | null;
  externalRef: string | null;
  createdAt: string;
}

export interface EventRow {
  id: string;
  owner: string;
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
 * (owner, assessment, program, rule_version) collides on the unique constraint —
 * we then return the EXISTING prediction-of-record (created: false) rather than
 * overwriting it (the UPDATE-guard trigger forbids overwrites anyway). A new rule
 * version yields a new row. Insert goes through the RLS-scoped client (S4).
 */
export async function insertPrediction(
  db: DB,
  input: {
    owner: string;
    assessmentId: string;
    programId: string;
    verdict: string;
    ruleVersion: string;
    scoreSnapshot: Json;
  },
): Promise<{ row: PredictionRow; created: boolean } | null> {
  const { data, error } = await db
    .from("program_predictions")
    .insert({
      owner: input.owner,
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
      .eq("owner", input.owner)
      .eq("assessment_id", input.assessmentId)
      .eq("program_id", input.programId)
      .eq("rule_version", input.ruleVersion)
      .maybeSingle();
    if (existing) return { row: mapPrediction(existing), created: false };
  }
  return null;
}

export async function getPredictionById(db: DB, id: string): Promise<PredictionRow | null> {
  // RLS scopes to the owner — another user's prediction simply returns no row.
  const { data, error } = await db.from("program_predictions").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapPrediction(data);
}

/**
 * Open an application attempt against a frozen prediction. `programId` is taken
 * from the prediction (not the client) so the attempt can't drift from what was
 * predicted; the composite FK (prediction_id, owner) enforces owner consistency.
 */
export async function insertAttempt(
  db: DB,
  input: {
    owner: string;
    predictionId: string;
    programId: string;
    institutionId?: string | null;
    intake?: string | null;
    externalRef?: string | null;
  },
): Promise<AttemptRow | null> {
  const { data, error } = await db
    .from("application_attempts")
    .insert({
      owner: input.owner,
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

export async function getAttemptById(db: DB, id: string): Promise<AttemptRow | null> {
  const { data, error } = await db.from("application_attempts").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapAttempt(data);
}

/** Attempts already opened against a prediction (used to keep the apply hook idempotent). */
export async function listAttemptsForPrediction(db: DB, predictionId: string): Promise<AttemptRow[]> {
  const { data, error } = await db
    .from("application_attempts")
    .select("*")
    .eq("prediction_id", predictionId);
  if (error || !data) return [];
  return data.map(mapAttempt);
}

/** Event types already on the attempt — the input to the funnel state machine (S7). */
export async function listEventTypesForAttempt(db: DB, attemptId: string): Promise<EventType[]> {
  const { data, error } = await db
    .from("outcome_events")
    .select("event_type")
    .eq("attempt_id", attemptId);
  if (error || !data) return [];
  return data.map((r) => r.event_type as EventType);
}

/**
 * Append a funnel event. gate/decision_authority/source are derived server-side
 * (B3) and passed in; RLS additionally forces source='self_reported' + verified_by
 * null on this path, so a user can only file unverified self-reports.
 */
export async function insertEvent(
  db: DB,
  input: {
    owner: string;
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
  const { data, error } = await db
    .from("outcome_events")
    .insert({
      owner: input.owner,
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

/** The signed-in user's full outcome history (RLS owner-scoped). */
export async function getOutcomesForUser(
  db: DB,
  owner: string,
): Promise<{ predictions: PredictionRow[]; attempts: AttemptRow[]; events: EventRow[] }> {
  const [p, a, e] = await Promise.all([
    db.from("program_predictions").select("*").eq("owner", owner),
    db.from("application_attempts").select("*").eq("owner", owner),
    db.from("outcome_events").select("*").eq("owner", owner),
  ]);
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
