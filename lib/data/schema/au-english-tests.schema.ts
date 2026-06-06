import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-english-tests.ts. Guards http(s) source
 * URLs, ISO dates, a boolean DHA-acceptance flag, an optional positive-number
 * minimum-score block (no stray keys), unique ids, and provenance (>=1
 * findingRef) on every test — so no acceptance claim can ship without tracing to
 * a `used` finding.
 */
const MinScoresSchema = z
  .object({
    listening: z.number().positive().optional(),
    reading: z.number().positive().optional(),
    writing: z.number().positive().optional(),
    speaking: z.number().positive().optional(),
    overall: z.number().positive().optional(),
    eachComponent: z.number().positive().optional(),
  })
  .strict()
  .refine((s) => Object.keys(s).length > 0, { message: "minScores, when present, must set at least one score" });

const AuEnglishTestSchema = z.object({
  id: z.string().min(1),
  testName: z.string().min(1),
  acceptedByDha: z.boolean(),
  minScores: MinScoresSchema.optional(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuEnglishTestsSchema = z
  .array(AuEnglishTestSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU English-test ids must be unique",
  });
