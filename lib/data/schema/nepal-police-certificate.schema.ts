import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-police-certificate.ts. Guards the id + kind
 * enums, non-empty label/summary, the http(s) source, ISO lastVerified, unique ids,
 * and provenance (>=1 findingRef).
 */
const NepalPoliceCertificateRecordSchema = z.object({
  id: z.enum(["opcr-application-route", "opcr-document-set", "opcr-validity"]),
  kind: z.enum(["application-route", "required-document", "validity-rule"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalPoliceCertificateSchema = z
  .array(NepalPoliceCertificateRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Nepal police-certificate ids must be unique",
  });
