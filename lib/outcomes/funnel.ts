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
  /** Every event type recorded against this attempt — drives the journey rail (MV-73). */
  events: EventType[];
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
      events: eventTypes,
    });
  }

  return rows.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
}

// --- Journey rail (MV-73) -------------------------------------------------
// A four-step horizontal rail showing where an attempt sits on the canonical
// happy path. The rail STOPS honestly: a rejection, refusal, or withdrawal
// marks an exit instead of ever lighting a milestone the student never reached.

/** The fixed milestones the rail renders, in journey order. */
export type RailStepKey = "applied" | "offer" | "visa_lodged" | "granted";

/** `passed`/`current`/`upcoming` are the happy path; `exit` is where a stopped journey halts. */
export type RailStepState = "passed" | "current" | "upcoming" | "exit";

/** `reach` is the verdict-red used for rejection/refusal; `neutral` is the grey used for a student's own withdrawal. */
export type RailTone = "positive" | "reach" | "neutral";

export interface RailStep {
  key: RailStepKey;
  /** The happy-path label, or the terminal word (Rejected/Refused/Withdrawn) at the exit step. */
  label: string;
  state: RailStepState;
  tone: RailTone;
}

export interface OutcomeRail {
  steps: RailStep[];
  ariaLabel: string;
}

const RAIL_KEYS: RailStepKey[] = ["applied", "offer", "visa_lodged", "granted"];
const RAIL_LABELS: Record<RailStepKey, string> = {
  applied: "Applied",
  offer: "Offer",
  visa_lodged: "Visa lodged",
  granted: "Granted",
};
// Any of these collapses into the single "Offer" step — there is no separate accepted rung.
const OFFER_EVENTS: EventType[] = ["offer_received", "conditional_offer", "offer_accepted", "coe_issued"];

function railAriaLabel(steps: RailStep[]): string {
  const parts = steps.map((s) => {
    switch (s.state) {
      case "passed":
        return `${s.label} done`;
      case "current":
        return `${s.label} reached`;
      case "exit":
        // s.label is the terminal word; name the happy milestone it never reached.
        return `${s.label}, ${RAIL_LABELS[s.key]} not reached`;
      default:
        return `${s.label} not reached`;
    }
  });
  return `Application progress: ${parts.join(", ")}.`;
}

/**
 * Map an attempt's event types onto the four-step journey rail. Pure: positions
 * derive only from which milestones the events confirm — nothing is inferred or
 * invented. A stopped journey (rejection/refusal/withdrawal) halts one step past
 * the furthest milestone reached and never paints a later step as achieved; a
 * withdrawal reads neutral (the student's own choice), not red.
 */
export function buildOutcomeRail(events: EventType[]): OutcomeRail {
  const set = new Set(events);
  const reachedOffer = OFFER_EVENTS.some((e) => set.has(e));
  const reachedLodged = set.has("visa_lodged");
  const reachedGranted = set.has("visa_granted") || set.has("enrolled");

  // The furthest happy-path milestone the events confirm. An opened attempt always
  // carries a root 'applied' event, so the floor is the Applied step (index 0).
  let reachedIndex = 0;
  if (reachedGranted) reachedIndex = 3;
  else if (reachedLodged) reachedIndex = 2;
  else if (reachedOffer) reachedIndex = 1;

  const rejected = set.has("application_rejected");
  const refused = set.has("visa_refused");
  const withdrawn = set.has("withdrawn");
  const stopped = rejected || refused || withdrawn;

  // The rail halts one step past the furthest milestone reached, marking why it
  // stopped. Withdrawal is the student's own decision — neutral, never red.
  const exitIndex = reachedIndex + 1;
  const exitTone: RailTone = withdrawn ? "neutral" : "reach";
  const exitLabel = refused ? "Refused" : rejected ? "Rejected" : "Withdrawn";
  const hasExit = stopped && exitIndex <= 3;

  const steps: RailStep[] = RAIL_KEYS.map((key, i) => {
    if (hasExit) {
      if (i < exitIndex) return { key, label: RAIL_LABELS[key], state: "passed", tone: "positive" };
      if (i === exitIndex) return { key, label: exitLabel, state: "exit", tone: exitTone };
      return { key, label: RAIL_LABELS[key], state: "upcoming", tone: "neutral" };
    }
    if (i < reachedIndex) return { key, label: RAIL_LABELS[key], state: "passed", tone: "positive" };
    if (i === reachedIndex) return { key, label: RAIL_LABELS[key], state: "current", tone: "positive" };
    return { key, label: RAIL_LABELS[key], state: "upcoming", tone: "neutral" };
  });

  return { steps, ariaLabel: railAriaLabel(steps) };
}
