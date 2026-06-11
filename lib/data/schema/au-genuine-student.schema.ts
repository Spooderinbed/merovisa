import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-genuine-student.ts. Guards a free-slug id, the
 * section enum, non-empty label/summary, an http(s) source, optional ISO lastVerified,
 * unique ids, and provenance (>=1 findingRef).
 */
const GenuineStudentRecordSchema = z.object({
  id: z.string().min(1),
  section: z.enum(["what-it-is", "the-questions", "how-weighed", "post-study", "evidence"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const GenuineStudentSchema = z
  .array(GenuineStudentRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Genuine Student ids must be unique",
  });
