import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-tuition-payment-facts.ts. Each record is
 * one labeled positive value with a unit. Guards the kind enum, the http(s)
 * source, ISO dates, unique ids, and provenance (>=1 findingRef).
 */
const AuTuitionPaymentFactSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  channel: z.string().min(1).optional(),
  kind: z.enum(["processing-time", "fx-rate-hold", "deposit", "refund-fee"]),
  label: z.string().min(1),
  value: z.number().positive(),
  unit: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuTuitionPaymentFactsSchema = z
  .array(AuTuitionPaymentFactSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU tuition-payment fact ids must be unique",
  });
