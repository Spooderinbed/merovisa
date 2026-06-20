// MV-08 — funnel state machine (S7).
// Pure guard the API runs before appending an outcome_events row: rejects
// illegal orderings (e.g. a visa grant before applying) and conflicting
// terminal outcomes within a gate (grant vs refusal, offer vs rejection).
// Corrections are NOT this path — they append a new row via supersedes_event_id,
// so a plain duplicate of an existing event type is rejected here.

import type { EventType } from "./types";

export interface TransitionResult {
  ok: boolean;
  reason?: string;
}

const POSITIVE_ADMISSION: readonly EventType[] = [
  "offer_received",
  "conditional_offer",
  "offer_accepted",
  "coe_issued",
];

export function canRecordEvent(prior: EventType[], next: EventType): TransitionResult {
  const has = (t: EventType) => prior.includes(t);
  const deny = (reason: string): TransitionResult => ({ ok: false, reason });
  const allow: TransitionResult = { ok: true };

  if (has(next)) return deny(`'${next}' already recorded (corrections supersede, not re-add)`);

  if (next === "applied") return allow; // the root event

  if (!has("applied")) return deny(`'${next}' is not valid before the application is recorded`);

  switch (next) {
    case "withdrawn":
      return allow; // legal any time after applying

    case "offer_received":
    case "conditional_offer":
      return has("application_rejected")
        ? deny("cannot record an offer after a rejection (supersede the rejection instead)")
        : allow;

    case "application_rejected":
      return POSITIVE_ADMISSION.some(has)
        ? deny("cannot record a rejection after an offer/CoE (supersede instead)")
        : allow;

    case "offer_accepted":
      return has("offer_received") || has("conditional_offer")
        ? allow
        : deny("cannot accept an offer that was never received");

    case "coe_issued":
      return has("offer_accepted") ? allow : deny("a CoE requires an accepted offer first");

    case "visa_lodged":
      return has("coe_issued") ? allow : deny("a visa cannot be lodged without a CoE");

    case "visa_granted":
      if (!has("visa_lodged")) return deny("a visa decision requires a lodged visa first");
      return has("visa_refused") ? deny("a visa was already refused for this attempt") : allow;

    case "visa_refused":
      if (!has("visa_lodged")) return deny("a visa decision requires a lodged visa first");
      return has("visa_granted") ? deny("a visa was already granted for this attempt") : allow;

    case "enrolled":
      return has("visa_granted") ? allow : deny("enrolment requires a granted visa first");

    default:
      return deny(`unhandled event type '${next}'`);
  }
}
