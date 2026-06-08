import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-biometrics.ts. Guards the id enum, non-empty
 * label/summary, the http(s) source, ISO lastVerified, unique ids, and provenance
 * (>=1 findingRef). Single-record module — no kind discriminator.
 */
const AuBiometricsRecordSchema = z.object({
  id: z.enum(["immi-app-biometrics-letter"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuBiometricsSchema = z
  .array(AuBiometricsRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU biometrics ids must be unique",
  });
