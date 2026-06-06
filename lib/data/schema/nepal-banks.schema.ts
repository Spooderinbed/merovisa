import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-banks.ts. Guards the invariants the
 * TypeScript type cannot: http(s) source URLs, ISO dates, sane numeric ranges,
 * unique ids, and — crucially — that every bank AND every education loan carries
 * provenance (the loan's `provenance` is what closes the unprovenanced
 * LoanPricing gap; pricing is covered by its enclosing loan).
 */

const LoanPricingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("base-spread"),
    minSpreadPct: z.number().nonnegative(),
    maxSpreadPct: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal("fixed"),
    minRatePct: z.number().nonnegative().optional(),
    maxRatePct: z.number().nonnegative().optional(),
    effectiveRatePct: z.number().nonnegative().optional(),
    effectiveDate: IsoDate.optional(),
  }),
]);

const NepalBankLoanSchema = z
  .object({
    productName: z.string().min(1).optional(),
    minAmountNpr: z.number().positive().optional(),
    maxAmountNpr: z.number().positive().optional(),
    maxTenureYears: z.number().positive().optional(),
    financingRatioPct: z.number().min(0).max(100).optional(),
    pricing: LoanPricingSchema.optional(),
    collateralRequired: z.boolean().optional(),
    notes: z.string().min(1).optional(),
    source: HttpUrl,
    lastVerified: IsoDate.optional(),
    provenance: ProvenanceSchema,
  })
  .refine(
    (l) => l.maxAmountNpr == null || l.minAmountNpr == null || l.maxAmountNpr >= l.minAmountNpr,
    { message: "maxAmountNpr must be >= minAmountNpr" },
  )
  .refine(
    (l) => l.pricing?.kind !== "base-spread" || l.pricing.maxSpreadPct >= l.pricing.minSpreadPct,
    { message: "maxSpreadPct must be >= minSpreadPct" },
  )
  .refine(
    (l) =>
      !(l.pricing?.kind === "fixed" && l.pricing.minRatePct != null && l.pricing.maxRatePct != null) ||
      l.pricing.maxRatePct >= l.pricing.minRatePct,
    { message: "maxRatePct must be >= minRatePct" },
  );

const NepalBankSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nrbClass: z.literal("A"),
  headOffice: z.string().min(1),
  branchCount: z.number().int().positive().optional(),
  educationLoan: NepalBankLoanSchema.optional(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalBanksSchema = z
  .array(NepalBankSchema)
  .refine((banks) => new Set(banks.map((b) => b.id)).size === banks.length, {
    message: "bank ids must be unique",
  });
