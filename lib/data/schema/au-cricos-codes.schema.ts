import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-cricos-codes.ts. Guards the CRICOS code
 * shape (five digits + an uppercase letter), the providerType enum, the http(s)
 * register source, ISO dates, unique ids, and provenance (>=1 findingRef) on
 * every record — so no provider code can ship without tracing to `used`
 * findings. cricosCode is intentionally NOT unique: one code can legitimately
 * appear twice (e.g. UNSW Sydney 00098G is also the code UNSW College delivers
 * UNSW Diplomas under).
 */
const AuCricosCodeSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  providerType: z.enum(["university", "pathway-college", "vet-rto"]),
  cricosCode: z.string().regex(/^\d{5}[A-Z]$/, "expected a CRICOS code like 00026A"),
  coverage: z.string().min(1).optional(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuCricosCodesSchema = z
  .array(AuCricosCodeSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU CRICOS code ids must be unique",
  });
