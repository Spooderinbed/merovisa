import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-skilled-visa-directory.ts. Guards the
 * 3-digit subclass code, the permanence enum, positive stay periods, the http(s)
 * source, ISO dates, and provenance (>=1 findingRef). A refine keeps a stay range
 * complete (maxStayYears never ships without minStayYears); array-level refines
 * keep both ids and subclass codes unique (each subclass appears once).
 */
const AuSkilledVisaSubclassSchema = z
  .object({
    id: z.string().min(1),
    subclass: z.string().regex(/^\d{3}$/, "expected a 3-digit DHA subclass code like 491"),
    name: z.string().min(1),
    permanence: z.enum(["temporary", "permanent"]).optional(),
    stayYears: z.number().positive().optional(),
    minStayYears: z.number().positive().optional(),
    maxStayYears: z.number().positive().optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine((r) => r.maxStayYears === undefined || r.minStayYears !== undefined, {
    message: "maxStayYears requires minStayYears — a stay range needs both bounds",
  });

export const AuSkilledVisaDirectorySchema = z
  .array(AuSkilledVisaSubclassSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU skilled-visa directory ids must be unique",
  })
  .refine((rows) => new Set(rows.map((r) => r.subclass)).size === rows.length, {
    message: "each DHA subclass code must appear once in the directory",
  });
