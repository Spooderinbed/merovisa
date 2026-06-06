import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-document-processing-times.ts. Guards
 * what the TypeScript type cannot: http(s) source URLs, ISO dates, a positive
 * whole-day turnaround, non-empty labels/issuers, unique ids, and provenance
 * (>=1 findingRef) on every record — so no processing time can ship without
 * tracing to a `used` finding.
 */
const NepalDocumentProcessingTimeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  issuer: z.string().min(1),
  typicalBusinessDays: z.number().int().positive(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalDocumentProcessingTimesSchema = z
  .array(NepalDocumentProcessingTimeSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "processing-time ids must be unique",
  });
