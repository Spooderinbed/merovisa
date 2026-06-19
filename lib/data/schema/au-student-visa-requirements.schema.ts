import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-student-visa-requirements.ts. Guards the
 * id enum, non-empty label/summary, the GS-only optional fields, the http(s)
 * source, ISO dates, unique ids, and provenance (>=1 findingRef).
 */
const AuStudentVisaRequirementSchema = z.object({
  id: z.enum(["coe", "oshc", "english", "financial-coverage", "genuine-student"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  questions: z.array(z.string().min(1)).optional(),
  responseLimitWords: z.number().int().positive().optional(),
  appliesSince: IsoDate.optional(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuStudentVisaRequirementsSchema = z
  .array(AuStudentVisaRequirementSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU student-visa-requirement ids must be unique",
  });
