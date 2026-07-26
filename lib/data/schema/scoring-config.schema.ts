import { z } from "zod";
import { FindingId, IsoDate, Volatility, missingReverifyBy } from "./common";

/**
 * Zod schemas for the sourced scoring-config layer (lib/data/policy/*).
 *
 * Provenance discipline: unlike the data-module `ProvenanceSchema` (which
 * mandates ≥1 findingRef), a config value may legitimately be a hand-tuned
 * constant. The refine below lets such a value through *only* when it is
 * explicitly tagged `source: "internal-heuristic"` — so an unsourced value can
 * never silently masquerade as sourced, yet honest heuristics aren't forced to
 * invent finding refs.
 *
 * The third class (MV-132) is a value read from a named authority that the
 * findings ledger cannot hold: a market rate is dynamic, so it gets rejected as a
 * finding (see D.003/D.004, `rejected:dynamic-data`) yet is still externally
 * sourced, not a heuristic. Such a value may cite its authority URL *only* if it
 * also carries both `lastVerified` and `reverifyBy` — citing an authority means
 * committing to re-read it, and that commitment is what stops a dated citation
 * from quietly ageing into a false one.
 */
/**
 * A citable authority URL: scheme + a real dotted host, so a bare `"https://"` (or
 * `"https://localhost"`) cannot pass itself off as a source. This cannot tell a
 * legitimate authority from an arbitrary domain — that stays a human review
 * judgement — but it does refuse a string that could never be opened and checked.
 */
const authorityUrl = (source: string | undefined): boolean =>
  source !== undefined && /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(source);

/**
 * A real calendar date, not merely an ISO-shaped string. `IsoDate` checks shape
 * only, so "9999-99-99" satisfies it and then sorts as indefinitely-future in the
 * lexicographic staleness comparisons — which would park a deadline permanently out
 * of reach. Checked here (rather than by tightening the shared `IsoDate`, which is
 * used repo-wide) because this is the branch where a date is the whole guarantee.
 */
const realDate = (iso: string | undefined): boolean =>
  iso !== undefined && !Number.isNaN(Date.parse(iso)) && iso === new Date(iso).toISOString().slice(0, 10);

/** An authority citation is only as good as its re-verification commitment. */
const authorityCited = (p: {
  source?: string;
  lastVerified?: string;
  reverifyBy?: string;
}): boolean =>
  authorityUrl(p.source) &&
  realDate(p.lastVerified) &&
  realDate(p.reverifyBy) &&
  // A deadline on or before its own verification date would already be due, i.e. a
  // citation that never commits to anything.
  p.reverifyBy! > p.lastVerified!;

export const ConfigProvenanceSchema = z
  .object({
    findingRefs: z.array(FindingId),
    source: z.string().optional(),
    lastVerified: IsoDate.optional(),
    effectiveDate: IsoDate.optional(),
    note: z.string().optional(),
    volatility: Volatility.optional(),
    reverifyBy: IsoDate.optional(),
  })
  .refine(
    (p) => p.findingRefs.length >= 1 || p.source === "internal-heuristic" || authorityCited(p),
    {
      message:
        "a config value needs ≥1 findingRef, source:'internal-heuristic', or an authority URL (real host) carrying real lastVerified + reverifyBy dates, with reverifyBy after lastVerified",
    },
  )
  .refine((p) => !missingReverifyBy(p), {
    message: "non-stable volatility requires a reverifyBy date",
  });

/** A `{ value, provenance }` wrapper whose `value` matches `valueSchema`. */
export const sourced = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({ value: valueSchema, provenance: ConfigProvenanceSchema });

const numberRecord = z.record(z.string(), z.number());
const minMax = z.object({ min: z.number(), max: z.number() });
const rangeRecord = z.record(z.string(), minMax);

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
export const RepresentativeTuitionSchema = sourced(z.number().positive());
export const DhaCapacityGateSchema = sourced(
  z.object({
    reachRatio: z.number().min(0).max(1),
    blockStrongCap: z.number().min(0).max(100),
    forceReachCap: z.number().min(0).max(100),
  }),
);
/** A sourced URL pointer (e.g. the DHA Document Checklist Tool the policy banner links). */
export const DctToolSchema = sourced(z.string().url());
/** Grant rate (%) by application cohort, each bound cited to its finding. Named fields (not min/max) so the offshore/onshore meaning survives a quarter where the two invert. */
export const GrantRateCohortsSchema = sourced(
  z.object({ offshore: z.number().min(0).max(100), onshore: z.number().min(0).max(100) }),
);
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
