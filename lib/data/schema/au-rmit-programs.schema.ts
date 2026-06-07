import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-rmit-programs.ts. Guards the http(s)
 * source URL, ISO dates, the RMIT provider literal, the level enum, positive
 * annual tuition and duration, unique ids, and provenance (>=1 findingRef) on
 * every program — so no program can ship without tracing to `used` findings.
 */
const AuRmitProgramSchema = z.object({
  id: z.string().min(1),
  provider: z.literal("RMIT University"),
  programName: z.string().min(1),
  level: z.enum(["bachelor", "master", "diploma", "graduate-diploma"]),
  tuitionAudPerYear: z.number().positive(),
  durationYears: z.number().positive(),
  fieldOfStudy: z.string().min(1).optional(),
  entryMinAveragePct: z.number().positive().max(100).optional(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuRmitProgramsSchema = z
  .array(AuRmitProgramSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU RMIT program ids must be unique",
  });
