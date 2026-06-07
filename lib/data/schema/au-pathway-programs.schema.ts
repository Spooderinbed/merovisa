import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-pathway-programs.ts. Tuition and duration
 * are optional (a record states what its college publishes), so a refine requires
 * each to carry at least one of them. A second refine keeps the accelerated
 * duration from shipping without the standard one it shortens. Guards the type
 * enum, positive numbers, the http(s) source, ISO dates, unique ids, and
 * provenance (>=1 findingRef).
 */
const AuPathwayProgramSchema = z
  .object({
    id: z.string().min(1),
    college: z.string().min(1),
    programName: z.string().min(1),
    type: z.enum(["diploma", "foundation"]),
    leadsTo: z.string().min(1).optional(),
    tuitionAud: z.number().positive().optional(),
    durationMonths: z.number().positive().optional(),
    acceleratedDurationMonths: z.number().positive().optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine((r) => r.tuitionAud !== undefined || r.durationMonths !== undefined, {
    message: "each pathway program must carry tuition or a standard duration",
  })
  .refine((r) => r.acceleratedDurationMonths === undefined || r.durationMonths !== undefined, {
    message: "acceleratedDurationMonths requires a standard durationMonths",
  });

export const AuPathwayProgramsSchema = z
  .array(AuPathwayProgramSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU pathway program ids must be unique",
  });
