import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-working-with-agents.ts. Guards a free-slug id, the
 * section enum, non-empty label/summary, an http(s) source, optional ISO lastVerified,
 * unique ids, and provenance (>=1 findingRef).
 */
const WorkingWithAgentsRecordSchema = z.object({
  id: z.string().min(1),
  section: z.enum(["do-you-need-one", "verify-register", "what-they-owe", "formal-representation", "commission-ban"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const WorkingWithAgentsSchema = z
  .array(WorkingWithAgentsRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Working-with-agents ids must be unique",
  });
