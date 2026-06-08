import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-financial-evidence.ts. Guards the id +
 * kind enums, non-empty label/summary, the http(s) source, ISO lastVerified,
 * unique ids, and provenance (>=1 findingRef).
 */
const AuFinancialEvidenceRecordSchema = z.object({
  id: z.enum(["deposit", "loan", "scholarship", "parent-partner-income", "living-cost-indicative"]),
  kind: z.enum(["evidence-path", "living-cost-note"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuFinancialEvidenceSchema = z
  .array(AuFinancialEvidenceRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU financial-evidence ids must be unique",
  });
