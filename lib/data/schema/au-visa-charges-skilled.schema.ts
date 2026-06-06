import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/policy/au-visa-charges-skilled.ts. Guards http(s)
 * source URLs, ISO dates, a positive subclass number and positive AUD base fee,
 * non-empty visa names, unique ids, and provenance (>=1 findingRef) on every
 * record — so no charge can ship without tracing to a `used` finding.
 */
const AuSkilledVisaChargeSchema = z.object({
  id: z.string().min(1),
  subclass: z.number().int().positive(),
  visaName: z.string().min(1),
  baseFeeAud: z.number().positive(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuSkilledVisaChargesSchema = z
  .array(AuSkilledVisaChargeSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "skilled-visa-charge ids must be unique",
  });
