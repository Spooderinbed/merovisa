import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-health-exam.ts. Guards the id + kind enums,
 * non-empty label/summary, the http(s) source, ISO lastVerified, unique ids, and
 * provenance (>=1 findingRef).
 */
const AuHealthExamRecordSchema = z.object({
  id: z.enum([
    "panel-physician-overseas",
    "cost-paid-to-clinic",
    "mhd-before-lodging",
    "undertaking-validity",
  ]),
  kind: z.enum(["process", "validity"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuHealthExamSchema = z
  .array(AuHealthExamRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU health-exam ids must be unique",
  });
