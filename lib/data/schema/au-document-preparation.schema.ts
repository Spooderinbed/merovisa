import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-document-preparation.ts. Guards the id + kind
 * enums, non-empty label/summary, the http(s) source, ISO lastVerified, unique ids,
 * and provenance (>=1 findingRef).
 */
const AuDocumentPreparationRecordSchema = z.object({
  id: z.enum([
    "translate-non-english",
    "submit-original-and-translation",
    "overseas-translator-details",
    "certified-copy-birth-certificate",
    "certified-copy-national-id",
  ]),
  kind: z.enum(["translation-rule", "certified-copy"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuDocumentPreparationSchema = z
  .array(AuDocumentPreparationRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU document-preparation ids must be unique",
  });
