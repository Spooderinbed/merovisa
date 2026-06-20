// MV-08 — event derivation (gate + decision authority + sign).
// Pure, server-side: the API derives these from event_type so the client never
// asserts a gate or who decided (design §5, B3).

import type { DecisionAuthority, EventType, Gate } from "./types";

const GATE_BY_EVENT: Record<EventType, Gate | null> = {
  applied: null,
  offer_received: "admission",
  conditional_offer: "admission",
  application_rejected: "admission",
  offer_accepted: "admission",
  coe_issued: "admission",
  visa_lodged: "visa",
  visa_granted: "visa",
  visa_refused: "visa",
  enrolled: null,
  withdrawn: null,
};

const AUTHORITY_BY_EVENT: Record<EventType, DecisionAuthority> = {
  applied: "student",
  offer_received: "institution",
  conditional_offer: "institution",
  application_rejected: "institution",
  offer_accepted: "student",
  coe_issued: "institution",
  visa_lodged: "student",
  visa_granted: "dha",
  visa_refused: "dha",
  enrolled: "institution",
  withdrawn: "student",
};

const NEGATIVE_OUTCOMES: ReadonlySet<EventType> = new Set(["application_rejected", "visa_refused"]);

/** The gate this event belongs to, or null for neutral steps (applied/enrolled/withdrawn). */
export function eventGate(eventType: EventType): Gate | null {
  return GATE_BY_EVENT[eventType];
}

/** Who made the decision this event records. */
export function eventDecisionAuthority(eventType: EventType): DecisionAuthority {
  return AUTHORITY_BY_EVENT[eventType];
}

/** True only for refusals/rejections — the events that carry a reason code. */
export function isNegativeOutcome(eventType: EventType): boolean {
  return NEGATIVE_OUTCOMES.has(eventType);
}
