import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-arrival-cash-guidance.ts. Guards http(s)
 * source URLs, ISO dates, a positive AUD amount, the context/qualifier enums,
 * unique ids, and provenance (>=1 findingRef) on every record — so no figure can
 * ship without tracing to a `used` finding.
 */
const AuArrivalCashGuidanceSchema = z.object({
  id: z.string().min(1),
  publisher: z.string().min(1),
  context: z.enum(["cash-on-person", "bank-account", "first-weeks"]),
  amountAud: z.number().positive(),
  qualifier: z.enum(["minimum", "up-to", "approximate"]),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuArrivalCashGuidanceListSchema = z
  .array(AuArrivalCashGuidanceSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "arrival-cash-guidance ids must be unique",
  });
