import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-income-certification.ts. Guards a free-slug id,
 * the income-type enum, non-empty summary, an http(s) source, optional ISO lastVerified,
 * unique ids, and provenance (>=1 findingRef).
 */
const NepalIncomeCertificationRecordSchema = z.object({
  id: z.string().min(1),
  incomeType: z.enum([
    "rental",
    "business-agriculture",
    "salary-pension",
    "fixed-deposit-interest",
    "foreign-income",
    "english-statement",
    "land-valuation",
    "sponsor-relationship",
  ]),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalIncomeCertificationSchema = z
  .array(NepalIncomeCertificationRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Income-certification ids must be unique",
  });
