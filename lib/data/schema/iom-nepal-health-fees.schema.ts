import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/iom-nepal-health-fees.ts. Guards http(s)
 * source URLs, ISO dates, a positive USD amount, non-empty labels, unique ids,
 * and provenance (>=1 findingRef) on every fee — so no fee can ship without
 * tracing to a `used` finding.
 */
const IomNepalHealthFeeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  examCode: z.string().min(1).optional(),
  amountUsd: z.number().positive(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const IomNepalHealthFeesSchema = z
  .array(IomNepalHealthFeeSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "IOM health-fee ids must be unique",
  });
