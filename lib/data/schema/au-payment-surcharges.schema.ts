import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/policy/au-payment-surcharges.ts. Guards http(s)
 * source URLs, ISO dates, a 0–100 surcharge percent, non-empty method labels,
 * unique ids, and provenance (>=1 findingRef) on every record — so no surcharge
 * can ship without tracing to a `used` finding.
 */
const AuPaymentSurchargeSchema = z.object({
  id: z.string().min(1),
  method: z.string().min(1),
  surchargePct: z.number().positive().max(100),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuPaymentSurchargesSchema = z
  .array(AuPaymentSurchargeSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "payment-surcharge ids must be unique",
  });
