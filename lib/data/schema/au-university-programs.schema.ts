import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-university-programs.ts. Every detail
 * field is optional (providers state different facts), so a refine requires each
 * record to carry at least one substantive value — no empty program rows. Guards
 * the CRICOS code shape, the level enum, positive tuition/duration/IELTS bands,
 * the http(s) source, ISO dates, unique ids, and provenance (>=1 findingRef).
 */
const AuUniversityProgramSchema = z
  .object({
    id: z.string().min(1),
    provider: z.string().min(1),
    programName: z.string().min(1),
    level: z.enum(["bachelor", "master", "diploma", "graduate-diploma"]),
    // Provider codes are 5 digits + a letter (00026A); course/program codes run
    // longer (090275E). Allow 5-7 digits + an uppercase letter.
    cricosCode: z.string().regex(/^\d{5,7}[A-Z]$/, "expected a CRICOS code like 090275E").optional(),
    firstYearTuitionAud: z.number().positive().optional(),
    totalTuitionAud: z.number().positive().optional(),
    durationYears: z.number().positive().optional(),
    fieldOfStudy: z.string().min(1).optional(),
    test: z.literal("IELTS").optional(),
    overallMin: z.number().positive().optional(),
    perBandMin: z.number().positive().optional(),
    accreditingBody: z.string().min(1).optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine(
    (r) =>
      r.cricosCode !== undefined ||
      r.firstYearTuitionAud !== undefined ||
      r.totalTuitionAud !== undefined ||
      r.durationYears !== undefined ||
      r.overallMin !== undefined,
    { message: "each program record must carry at least one substantive field (CRICOS code, tuition, duration, or IELTS)" },
  );

export const AuUniversityProgramsSchema = z
  .array(AuUniversityProgramSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU university program ids must be unique",
  });
