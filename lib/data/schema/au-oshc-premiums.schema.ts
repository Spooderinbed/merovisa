import { z } from "zod";
import { HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-oshc-premiums.ts. Guards http(s) source URLs,
 * ISO dates, positive-or-null AUD premiums, the single literal cover type, unique ids,
 * and the quote-only consistency rule: a `quoteOnly` provider must carry null premiums
 * (we never invent a number), and a priced provider must carry an annual figure. No
 * provenance/findingRefs — this is display cost data on the cost-to-apply model, not a
 * ledger-backed scoring fact.
 */
const AuOshcPremiumSchema = z
  .object({
    id: z.string().min(1),
    provider: z.string().min(1),
    singleCoverAudPerYear: z.number().positive().nullable(),
    singleCoverAudPerMonth: z.number().positive().nullable().optional(),
    coverType: z.literal("single"),
    quoteOnly: z.boolean(),
    basis: z.string().min(1),
    source: HttpUrl,
    lastVerified: IsoDate,
  })
  .refine(
    (r) =>
      r.quoteOnly
        ? r.singleCoverAudPerYear === null && (r.singleCoverAudPerMonth ?? null) === null
        : r.singleCoverAudPerYear !== null,
    {
      message:
        "quote-only providers must carry null premiums; priced providers must carry an annual premium",
    },
  );

export const AuOshcPremiumsListSchema = z
  .array(AuOshcPremiumSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "au-oshc-premiums ids must be unique",
  });
