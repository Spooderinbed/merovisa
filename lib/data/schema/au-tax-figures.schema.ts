import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/policy/au-tax-figures.ts. Guards http(s) source
 * URLs, ISO dates, a positive value, the unit enum, non-empty labels, unique ids,
 * and provenance (>=1 findingRef) on every figure — so no figure can ship without
 * tracing to a `used` finding.
 */
const AuTaxFigureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.number().positive(),
  unit: z.enum(["AUD", "%", "days"]),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuTaxFiguresSchema = z
  .array(AuTaxFigureSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "tax-figure ids must be unique",
  });
