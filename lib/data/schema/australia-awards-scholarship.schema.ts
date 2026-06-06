import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/australia-awards-scholarship.ts. Guards the
 * http(s) source URL, ISO dates (including both ends of the application window),
 * the fixed Master's study level, a non-empty unique-valued benefits list drawn
 * from the known inclusions, and provenance (>=1 findingRef) — so the Award can't
 * ship without tracing to `used` findings.
 */
const AustraliaAwardsBenefitSchema = z.enum([
  "full-tuition",
  "return-airfare",
  "oshc",
  "living-stipend",
]);

const AustraliaAwardsScholarshipSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  country: z.string().min(1),
  studyLevel: z.literal("masters"),
  benefits: z
    .array(AustraliaAwardsBenefitSchema)
    .min(1)
    .refine((b) => new Set(b).size === b.length, { message: "benefits must be unique" }),
  applicationOpens: IsoDate,
  applicationCloses: IsoDate,
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AustraliaAwardsScholarshipsSchema = z
  .array(AustraliaAwardsScholarshipSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Australia Awards scholarship ids must be unique",
  });
