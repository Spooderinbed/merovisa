import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-provider-application-fees.ts. Guards
 * http(s) source URLs, ISO dates, the conditionality enum, a NON-NEGATIVE AUD
 * amount (0 = no fee is valid), unique ids, and provenance (>=1 findingRef) on
 * every fee — so no fee can ship without tracing to a `used` finding.
 */
const AuProviderApplicationFeeSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  amountAud: z.number().nonnegative(),
  conditionality: z.enum(["standard", "conditional", "none"]),
  refundable: z.boolean().optional(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuProviderApplicationFeesSchema = z
  .array(AuProviderApplicationFeeSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU provider application-fee ids must be unique",
  });
