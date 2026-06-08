import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-noc-journey.ts. Guards the id + kind
 * enums, non-empty label/summary, the http(s) source, ISO lastVerified, unique ids,
 * and provenance (>=1 findingRef).
 */
const NepalNocJourneyRecordSchema = z.object({
  id: z.enum([
    "noc-doc-citizenship",
    "noc-doc-academic",
    "noc-doc-guardian",
    "noc-doc-previous",
    "noc-doc-transcript",
    "noc-doc-offer",
    "noc-step-online",
    "noc-step-visit",
  ]),
  kind: z.enum(["required-document", "process-step"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalNocJourneySchema = z
  .array(NepalNocJourneyRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Nepal NOC journey ids must be unique",
  });
