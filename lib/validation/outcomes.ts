// MV-08 — Zod schemas for the outcome-validation API (design §5).
// All inputs read `owner` from the session, never the body. F16: the client
// only NAMES the program it is committing to — it never supplies a verdict,
// score snapshot, or rule version (the server recomputes and stamps those).

import { z } from "zod";
import { EVENT_TYPES, REASON_CODES, reasonCodeGate } from "@/lib/outcomes/types";
import { eventGate, isNegativeOutcome } from "@/lib/outcomes/events";

/** POST /api/outcomes/prediction — freeze a prediction run for the named program.
 *  assessment_id is NOT taken from the body: the server derives it from the user's
 *  primary assessment (Decision C) so a user can't freeze against someone else's
 *  assessment, and the client can't choose the anchor. F16: the body names only
 *  the program; verdict/snapshot/rule_version are recomputed and stamped server-side. */
export const PredictionInputSchema = z.object({
  programId: z.string().min(1),
});
export type PredictionInput = z.infer<typeof PredictionInputSchema>;

/** POST /api/outcomes/attempt — open an application attempt against a prediction. */
export const AttemptInputSchema = z.object({
  predictionId: z.uuid(),
  institutionId: z.string().min(1).optional(),
  intake: z.string().min(1).optional(),
  externalRef: z.string().min(1).optional(),
});
export type AttemptInput = z.infer<typeof AttemptInputSchema>;

/** POST /api/outcomes/event — append a funnel event. gate/decision_authority/source
 *  are derived server-side; the client only supplies the event and its timing. */
export const EventInputSchema = z
  .object({
    attemptId: z.uuid(),
    eventType: z.enum(EVENT_TYPES),
    occurredAt: z.iso.datetime(),
    occurredOn: z.iso.date().optional(),
    reasonCode: z.enum(REASON_CODES).optional(),
    detail: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.reasonCode === undefined) return;
    if (!isNegativeOutcome(val.eventType)) {
      ctx.addIssue({
        code: "custom",
        path: ["reasonCode"],
        message: "a reason code is only allowed on a rejection or refusal",
      });
      return;
    }
    if (eventGate(val.eventType) !== reasonCodeGate(val.reasonCode)) {
      ctx.addIssue({
        code: "custom",
        path: ["reasonCode"],
        message: "the reason code does not belong to this event's gate",
      });
    }
  });
export type EventInput = z.infer<typeof EventInputSchema>;
