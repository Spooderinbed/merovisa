import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-police-certificate.ts. Guards the id enum,
 * non-empty label/summary, the http(s) source, ISO lastVerified, unique ids, and
 * provenance (>=1 findingRef). Single-record module — no kind discriminator.
 */
const AuPoliceCertificateRecordSchema = z.object({
  id: z.enum(["police-certificate-requirement"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuPoliceCertificateSchema = z
  .array(AuPoliceCertificateRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU police-certificate ids must be unique",
  });
