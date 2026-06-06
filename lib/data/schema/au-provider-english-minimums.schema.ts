import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-provider-english-minimums.ts. Guards
 * http(s) source URLs, ISO dates, the IELTS test literal, positive overall and
 * per-band IELTS bands, unique ids, and provenance (>=1 findingRef) on every
 * record — so no English minimum can ship without tracing to a `used` finding.
 */
const AuProviderEnglishMinimumSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  test: z.literal("IELTS"),
  overallMin: z.number().positive(),
  perBandMin: z.number().positive().optional(),
  appliesTo: z.string().min(1).optional(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuProviderEnglishMinimumsSchema = z
  .array(AuProviderEnglishMinimumSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU provider English-minimum ids must be unique",
  });
