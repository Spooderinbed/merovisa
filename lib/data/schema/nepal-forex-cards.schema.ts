import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-forex-cards.ts. Every fee field is
 * optional (each card exposes a different fee structure), so a refine requires
 * each record to carry at least one fee/limit. A second refine keeps the USD
 * floor from shipping without the percent it qualifies. Guards positive numbers,
 * the http(s) source, ISO dates, unique ids, and provenance (>=1 findingRef).
 */
const NepalForexCardSchema = z
  .object({
    id: z.string().min(1),
    provider: z.string().min(1),
    card: z.string().min(1),
    cashLoadFeeNpr: z.number().positive().optional(),
    foreignAtmFeePct: z.number().positive().optional(),
    foreignAtmFeeMinUsd: z.number().positive().optional(),
    crossBorderFeePct: z.number().positive().optional(),
    feeFreeAtmMonthlyLimitAud: z.number().positive().optional(),
    atmFeeAboveLimitPct: z.number().positive().optional(),
    supportedCurrencyCount: z.number().int().positive().optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine(
    (r) =>
      r.cashLoadFeeNpr !== undefined ||
      r.foreignAtmFeePct !== undefined ||
      r.crossBorderFeePct !== undefined ||
      r.feeFreeAtmMonthlyLimitAud !== undefined ||
      r.atmFeeAboveLimitPct !== undefined ||
      r.supportedCurrencyCount !== undefined,
    { message: "each forex-card record must carry at least one fee, limit, or currency count" },
  )
  .refine((r) => r.foreignAtmFeeMinUsd === undefined || r.foreignAtmFeePct !== undefined, {
    message: "foreignAtmFeeMinUsd is a floor on foreignAtmFeePct — it cannot ship without the percent",
  });

export const NepalForexCardsSchema = z
  .array(NepalForexCardSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Nepal forex-card ids must be unique",
  });
