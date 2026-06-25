// MV-14 read-side — fold a user's outcome rows into a display-ready funnel.
// The state machine (state-machine.ts) answers "what's legal next"; this answers
// "where is this attempt now" for the dashboard surface. Pure + server-safe.

import type { EventType } from "./types";
import type { PredictionRow, AttemptRow, EventRow } from "./repo";
import { selfReportNextEvents } from "./state-machine";

/** The single milestone an attempt currently sits at, for display. */
export type FunnelStage =
  | "applied"
  | "offer"
  | "accepted"
  | "rejected"
  | "visa_lodged"
  | "visa_granted"
  | "visa_refused"
  | "enrolled"
  | "withdrawn";

// Priority order: the first stage whose triggering event is present wins. Terminal
// outcomes (withdrawn, enrolled, both visa decisions, rejection) outrank the
// positive milestones they imply, so a refused visa reads as "refused", not "CoE".
const STAGE_RULES: Array<{ stage: FunnelStage; when: EventType[] }> = [
  { stage: "withdrawn", when: ["withdrawn"] },
  { stage: "enrolled", when: ["enrolled"] },
  { stage: "visa_granted", when: ["visa_granted"] },
  { stage: "visa_refused", when: ["visa_refused"] },
  { stage: "visa_lodged", when: ["visa_lodged"] },
  { stage: "accepted", when: ["coe_issued", "offer_accepted"] },
  { stage: "rejected", when: ["application_rejected"] },
  { stage: "offer", when: ["offer_received", "conditional_offer"] },
  { stage: "applied", when: ["applied"] },
];

export function deriveFunnelStage(events: EventType[]): FunnelStage {
  const set = new Set(events);
  for (const rule of STAGE_RULES) {
    if (rule.when.some((t) => set.has(t))) return rule.stage;
  }
  return "applied"; // an opened attempt always has a root 'applied' event; default defensively
}

export interface OutcomeFunnelRow {
  attemptId: string;
  programName: string;
  universityName: string | null;
  verdict: string;
  stage: FunnelStage;
  intake: string | null;
  lastUpdated: string;
  /** The legal next milestones the student can self-report from this row (S7). */
  nextEvents: EventType[];
}

export interface BuildOutcomeFunnelInput {
  predictions: PredictionRow[];
  attempts: AttemptRow[];
  events: EventRow[];
  programLookup: Map<string, { programName: string; universityName: string | null }>;
}

/**
 * One row per application attempt: the program it targets, the frozen verdict from
 * its prediction, and the current funnel stage from its events. Attempts without a
 * matching prediction are dropped (defensive — the FK should make this impossible).
 * Sorted most-recently-updated first.
 */
export function buildOutcomeFunnel(input: BuildOutcomeFunnelInput): OutcomeFunnelRow[] {
  const predictionById = new Map(input.predictions.map((p) => [p.id, p]));
  const eventsByAttempt = new Map<string, EventRow[]>();
  for (const e of input.events) {
    const list = eventsByAttempt.get(e.attemptId);
    if (list) list.push(e);
    else eventsByAttempt.set(e.attemptId, [e]);
  }

  const rows: OutcomeFunnelRow[] = [];
  for (const attempt of input.attempts) {
    const prediction = predictionById.get(attempt.predictionId);
    if (!prediction) continue;

    const attemptEvents = eventsByAttempt.get(attempt.id) ?? [];
    const eventTypes = attemptEvents.map((e) => e.eventType);
    const stage = deriveFunnelStage(eventTypes);
    const nextEvents = selfReportNextEvents(eventTypes);
    const program = input.programLookup.get(attempt.programId);
    const lastUpdated = attemptEvents.reduce(
      (latest, e) => (e.occurredAt > latest ? e.occurredAt : latest),
      attempt.createdAt,
    );

    rows.push({
      attemptId: attempt.id,
      programName: program?.programName ?? "Your program",
      universityName: program?.universityName ?? null,
      verdict: prediction.verdict,
      stage,
      intake: attempt.intake,
      lastUpdated,
      nextEvents,
    });
  }

  return rows.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
}
