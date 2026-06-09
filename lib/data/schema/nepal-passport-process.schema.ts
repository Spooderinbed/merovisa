import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-passport-process.ts. Guards the id enum
 * (no kind discriminator), non-empty label/summary, the http(s) source, ISO lastVerified,
 * unique ids, and provenance (>=1 findingRef).
 */
const NepalPassportProcessRecordSchema = z.object({
  id: z.enum(["pre-enrolment", "choose-centre", "barcode-copy", "enrolment-biometrics"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalPassportProcessSchema = z
  .array(NepalPassportProcessRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Nepal passport-process ids must be unique",
  });
