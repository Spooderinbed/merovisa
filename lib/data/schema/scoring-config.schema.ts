import { z } from "zod";
import { FindingId, IsoDate } from "./common";

/**
 * Zod schemas for the sourced scoring-config layer (lib/data/policy/*).
 *
 * Provenance discipline: unlike the data-module `ProvenanceSchema` (which
 * mandates ≥1 findingRef), a config value may legitimately be a hand-tuned
 * constant. The refine below lets such a value through *only* when it is
 * explicitly tagged `source: "internal-heuristic"` — so an unsourced value can
 * never silently masquerade as sourced, yet honest heuristics aren't forced to
 * invent finding refs.
 */
export const ConfigProvenanceSchema = z
  .object({
    findingRefs: z.array(FindingId),
    source: z.string().optional(),
    lastVerified: IsoDate.optional(),
    effectiveDate: IsoDate.optional(),
    note: z.string().optional(),
  })
  .refine((p) => p.findingRefs.length >= 1 || p.source === "internal-heuristic", {
    message: "a config value needs ≥1 findingRef or source:'internal-heuristic'",
  });

/** A `{ value, provenance }` wrapper whose `value` matches `valueSchema`. */
export const sourced = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({ value: valueSchema, provenance: ConfigProvenanceSchema });

const numberRecord = z.record(z.string(), z.number());
const rangeRecord = z.record(z.string(), z.object({ min: z.number(), max: z.number() }));

export const FieldCompetitivenessSchema = sourced(numberRecord);
export const LevelBonusSchema = sourced(numberRecord);
export const FundingReliabilitySchema = sourced(numberRecord);
export const FxRateSchema = sourced(z.number());
export const EnglishThresholdSchema = sourced(numberRecord);
export const GapReasonWeightSchema = sourced(numberRecord);
export const GapPenaltiesSchema = sourced(
  z.object({ none: z.number(), upTo2: z.number(), upTo5: z.number(), beyond: z.number() }),
);
export const ScalarPenaltySchema = sourced(z.number());
export const TypicalYearlySchema = sourced(rangeRecord);
export const DhaLivingSchema = sourced(z.number());
export const DimensionWeightsSchema = sourced(
  z.object({
    academic: z.number(),
    financial: z.number(),
    visa: z.number(),
    profileStrength: z.number(),
  }),
);
export const VerdictCutoffsSchema = sourced(
  z.object({
    strongWeighted: z.number(),
    strongMinDimension: z.number(),
    possibleWeighted: z.number(),
    minDimensionFloor: z.number(),
  }),
);
export const ProfileStrengthPointsSchema = sourced(
  z.object({
    base: z.number(),
    masters: z.number(),
    bachelors: z.number(),
    work: z.number(),
    venture: z.number(),
    english75: z.number(),
    english70: z.number(),
  }),
);
