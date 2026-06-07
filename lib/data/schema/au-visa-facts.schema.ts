import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-visa-facts.ts. Each record carries either
 * a scalar value (number, or a boolean for a work right) or a min/max range
 * (a security bond). Refines: a fact must carry a scalar or a complete range;
 * maxValue never ships without minValue; and numeric/range facts must carry a
 * unit (booleans may omit it). Guards the kind enum, the http(s) source, ISO
 * dates, unique ids, and provenance (>=1 findingRef).
 */
const AuVisaFactSchema = z
  .object({
    id: z.string().min(1),
    subclass: z.string().regex(/^\d{3}$/, "expected a 3-digit DHA subclass code").optional(),
    category: z.string().min(1),
    kind: z.enum(["application-charge", "processing-time", "stay-period", "security-bond", "work-right"]),
    label: z.string().min(1),
    value: z.union([z.number(), z.boolean()]).optional(),
    minValue: z.number().positive().optional(),
    maxValue: z.number().positive().optional(),
    unit: z.string().min(1).optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine((r) => r.value !== undefined || (r.minValue !== undefined && r.maxValue !== undefined), {
    message: "each fact must carry a scalar value or a complete min/max range",
  })
  .refine((r) => r.maxValue === undefined || r.minValue !== undefined, {
    message: "maxValue requires minValue — a range needs both bounds",
  })
  .refine((r) => typeof r.value === "boolean" || r.unit !== undefined, {
    message: "numeric and range facts must carry a unit",
  });

export const AuVisaFactsSchema = z
  .array(AuVisaFactSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU visa-fact ids must be unique",
  });
