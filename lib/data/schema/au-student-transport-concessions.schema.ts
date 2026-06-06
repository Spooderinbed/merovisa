import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-student-transport-concessions.ts. Guards
 * http(s) source URLs, ISO dates, the state/concessionType enums, a non-negative
 * AUD amount (0 = free), positive validity/discount, unique ids, and provenance
 * (>=1 findingRef) on every record — so nothing can ship without tracing to a
 * `used` finding.
 */
const AuTransportConcessionSchema = z.object({
  id: z.string().min(1),
  state: z.enum(["NSW", "VIC", "QLD", "ACT"]),
  label: z.string().min(1),
  concessionType: z.enum(["card-fee", "card-validity", "percentage-saving", "flat-fare"]),
  amountAud: z.number().nonnegative().optional(),
  validityMonths: z.number().positive().optional(),
  discountPct: z.number().positive().max(100).optional(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuStudentTransportConcessionsSchema = z
  .array(AuTransportConcessionSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "transport-concession ids must be unique",
  });
