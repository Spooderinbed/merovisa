import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-temporary-graduate-visa.ts. Every detail
 * field is optional (the overview and each stream state different facts), so a
 * refine requires every record to carry at least one substantive fact. A second
 * refine enforces that a stay range is complete — maxStayYears never ships
 * without its minStayYears partner (the {min,max} reconcile needs both bounds).
 * Guards the 485 literal, the http(s) source, ISO dates, unique ids, positive
 * numbers, and provenance (>=1 findingRef).
 */
const AuTemporaryGraduateVisaFactSchema = z
  .object({
    id: z.string().min(1),
    subclass: z.literal("485"),
    stream: z.string().min(1).optional(),
    minStayYears: z.number().positive().optional(),
    maxStayYears: z.number().positive().optional(),
    maxStayMonths: z.number().positive().optional(),
    bringsFamily: z.boolean().optional(),
    baseApplicationChargeAud: z.number().positive().optional(),
    maxAgeYears: z.number().positive().optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine(
    (r) =>
      r.stream !== undefined ||
      r.minStayYears !== undefined ||
      r.maxStayMonths !== undefined ||
      r.bringsFamily !== undefined ||
      r.baseApplicationChargeAud !== undefined ||
      r.maxAgeYears !== undefined,
    { message: "each 485 record must carry at least one substantive fact" },
  )
  .refine((r) => r.maxStayYears === undefined || r.minStayYears !== undefined, {
    message: "maxStayYears requires minStayYears — a stay range needs both bounds",
  });

export const AuTemporaryGraduateVisaSchema = z
  .array(AuTemporaryGraduateVisaFactSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU temporary graduate visa ids must be unique",
  });
