import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-scholarships.ts. Every detail field is
 * optional (funders publish different facts), so a refine requires each record
 * to carry at least one substantive value (amount, count, total, or benefits).
 * Guards positive numbers, an integer scholarship count, the http(s) source,
 * ISO dates, unique ids, and provenance (>=1 findingRef).
 */
const AuScholarshipSchema = z
  .object({
    id: z.string().min(1),
    provider: z.string().min(1),
    name: z.string().min(1),
    annualAmountAud: z.number().positive().optional(),
    annualScholarshipCount: z.number().int().positive().optional(),
    totalAnnualValueAud: z.number().positive().optional(),
    benefits: z.array(z.string().min(1)).min(1).optional(),
    regionalCampusOnly: z.boolean().optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine(
    (r) =>
      r.annualAmountAud !== undefined ||
      r.annualScholarshipCount !== undefined ||
      r.totalAnnualValueAud !== undefined ||
      r.benefits !== undefined,
    { message: "each scholarship must carry at least one substantive fact (amount, count, total, or benefits)" },
  );

export const AuScholarshipsSchema = z
  .array(AuScholarshipSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU scholarship ids must be unique",
  });
