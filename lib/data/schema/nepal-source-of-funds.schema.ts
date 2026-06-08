import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-source-of-funds.ts. Guards the id +
 * kind enums, non-empty label/summary, the http(s) source, ISO lastVerified,
 * unique ids, and provenance (>=1 findingRef).
 */
const NepalSourceOfFundsRecordSchema = z.object({
  id: z.enum([
    "noc-definition",
    "noc-requirement",
    "institution-documents",
    "living-expense-remittance",
    "forex-portal-confirmation",
  ]),
  kind: z.enum(["definition", "bank-requirement", "remittance-mechanism"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalSourceOfFundsSchema = z
  .array(NepalSourceOfFundsRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Nepal source-of-funds ids must be unique",
  });
