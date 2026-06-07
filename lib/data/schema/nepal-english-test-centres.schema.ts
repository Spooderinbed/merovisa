import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-english-test-centres.ts. Detail fields
 * are optional, so a refine requires each record to carry at least one substantive
 * fact (a location count or a fee). A second refine keeps the named-locations list
 * consistent with its count when both are present. Guards positive integers, the
 * http(s) source, ISO dates, unique ids, and provenance (>=1 findingRef).
 */
const NepalEnglishTestCentreSchema = z
  .object({
    id: z.string().min(1),
    operator: z.string().min(1),
    test: z.string().min(1),
    locationCount: z.number().int().positive().optional(),
    locations: z.array(z.string().min(1)).min(1).optional(),
    computerDeliveredFeeNpr: z.number().positive().optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine((r) => r.locationCount !== undefined || r.computerDeliveredFeeNpr !== undefined, {
    message: "each test-centre record must carry at least one substantive fact (location count or fee)",
  })
  .refine(
    (r) => r.locations === undefined || r.locationCount === undefined || r.locations.length === r.locationCount,
    { message: "locations list length must equal locationCount when both are given" },
  );

export const NepalEnglishTestCentresSchema = z
  .array(NepalEnglishTestCentreSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Nepal English test-centre ids must be unique",
  });
