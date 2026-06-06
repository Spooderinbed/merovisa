import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-application-fees.ts. Guards what the
 * TypeScript type cannot: http(s) source URLs, ISO dates, a positive NPR
 * amount, non-empty labels, unique ids, and provenance (>=1 findingRef) on
 * every fee — so no fee can ship without tracing to a `used` finding.
 */
const NepalApplicationFeeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["english-test", "visa-logistics", "medical", "document"]),
  amountNpr: z.number().positive(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalApplicationFeesSchema = z
  .array(NepalApplicationFeeSchema)
  .refine((fees) => new Set(fees.map((f) => f.id)).size === fees.length, {
    message: "fee ids must be unique",
  });
