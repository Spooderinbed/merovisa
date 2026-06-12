import { z } from "zod";
import type {
  Currency,
  Destination,
  EducationLevel,
  FieldOfStudy,
  FundingSource,
  GapReason,
} from "@/lib/scoring/types";
import type { Provenance } from "@/lib/data/types";
import {
  FIELD_COMPETITIVENESS as FIELD_COMPETITIVENESS_SRC,
  LEVEL_BONUS as LEVEL_BONUS_SRC,
} from "./policy/field-competitiveness";
import { FUNDING_RELIABILITY as FUNDING_RELIABILITY_SRC } from "./policy/funding-reliability";
import { FX_RATES as FX_RATES_SRC } from "./policy/fx-rates";
import {
  ENGLISH_THRESHOLD_BY_DEST as ENGLISH_THRESHOLD_BY_DEST_SRC,
  ENGLISH_VISA_FLOOR_BY_DEST as ENGLISH_VISA_FLOOR_BY_DEST_SRC,
  GAP_REASON_WEIGHT as GAP_REASON_WEIGHT_SRC,
  GAP_PENALTIES as GAP_PENALTIES_SRC,
  ENGLISH_NOT_TAKEN_PENALTY as ENGLISH_NOT_TAKEN_PENALTY_SRC,
  ENGLISH_BAND_DELTA_POINTS as ENGLISH_BAND_DELTA_POINTS_SRC,
} from "./policy/english-thresholds";
import {
  AU_DHA_LIVING_CAPACITY_AUD as AU_DHA_LIVING_CAPACITY_AUD_SRC,
  AU_DHA_PARTNER_CAPACITY_AUD as AU_DHA_PARTNER_CAPACITY_AUD_SRC,
  AU_DHA_CHILD_CAPACITY_AUD as AU_DHA_CHILD_CAPACITY_AUD_SRC,
  TYPICAL_YEARLY_USD as TYPICAL_YEARLY_USD_SRC,
  AU_REPRESENTATIVE_TUITION_AUD as AU_REPRESENTATIVE_TUITION_AUD_SRC,
  AU_DHA_CAPACITY_GATE as AU_DHA_CAPACITY_GATE_SRC,
} from "./policy/au-cost-of-living";
import {
  DIMENSION_WEIGHTS as DIMENSION_WEIGHTS_SRC,
  VERDICT_CUTOFFS as VERDICT_CUTOFFS_SRC,
  PROFILE_STRENGTH_POINTS as PROFILE_STRENGTH_POINTS_SRC,
} from "./policy/verdict-thresholds";
import {
  FieldCompetitivenessSchema,
  LevelBonusSchema,
  FundingReliabilitySchema,
  FxRateSchema,
  EnglishThresholdSchema,
  GapReasonWeightSchema,
  GapPenaltiesSchema,
  ScalarPenaltySchema,
  TypicalYearlySchema,
  DhaLivingSchema,
  RepresentativeTuitionSchema,
  DhaCapacityGateSchema,
  DimensionWeightsSchema,
  VerdictCutoffsSchema,
  ProfileStrengthPointsSchema,
} from "./schema/scoring-config.schema";

/**
 * The single source of truth the scoring engine reads (from Phase 5 on). Each
 * sourced module (lib/data/policy/*) is validated against its Zod schema on load
 * — outside production for zero runtime cost — then its `.value` is unwrapped and
 * frozen, so scoring math is byte-identical to the previous inline constants.
 * The provenance rides alongside in CONFIG_PROVENANCE for explainability and
 * reconciliation.
 *
 * Nothing imports this in Phase 4: it exists, validated, but unread, so the
 * characterization goldens are untouched. Phase 5 flips each scorer's read-path.
 */
const VALIDATE = process.env.NODE_ENV !== "production";

function checked<M>(schema: z.ZodTypeAny, mod: M, name: string): M {
  if (VALIDATE) {
    const r = schema.safeParse(mod);
    if (!r.success) throw new Error(`[scoring-config] ${name} failed schema validation: ${r.error.message}`);
  }
  return mod;
}

const fieldComp = checked(FieldCompetitivenessSchema, FIELD_COMPETITIVENESS_SRC, "FIELD_COMPETITIVENESS");
const levelBonus = checked(LevelBonusSchema, LEVEL_BONUS_SRC, "LEVEL_BONUS");
const fundingRel = checked(FundingReliabilitySchema, FUNDING_RELIABILITY_SRC, "FUNDING_RELIABILITY");
const englishThreshold = checked(EnglishThresholdSchema, ENGLISH_THRESHOLD_BY_DEST_SRC, "ENGLISH_THRESHOLD_BY_DEST");
const englishVisaFloor = checked(EnglishThresholdSchema, ENGLISH_VISA_FLOOR_BY_DEST_SRC, "ENGLISH_VISA_FLOOR_BY_DEST");
const gapReasonWeight = checked(GapReasonWeightSchema, GAP_REASON_WEIGHT_SRC, "GAP_REASON_WEIGHT");
const gapPenalties = checked(GapPenaltiesSchema, GAP_PENALTIES_SRC, "GAP_PENALTIES");
const englishNotTaken = checked(ScalarPenaltySchema, ENGLISH_NOT_TAKEN_PENALTY_SRC, "ENGLISH_NOT_TAKEN_PENALTY");
const englishBandDelta = checked(ScalarPenaltySchema, ENGLISH_BAND_DELTA_POINTS_SRC, "ENGLISH_BAND_DELTA_POINTS");
const typicalYearly = checked(TypicalYearlySchema, TYPICAL_YEARLY_USD_SRC, "TYPICAL_YEARLY_USD");
const dhaLiving = checked(DhaLivingSchema, AU_DHA_LIVING_CAPACITY_AUD_SRC, "AU_DHA_LIVING_CAPACITY_AUD");
const dhaPartner = checked(DhaLivingSchema, AU_DHA_PARTNER_CAPACITY_AUD_SRC, "AU_DHA_PARTNER_CAPACITY_AUD");
const dhaChild = checked(DhaLivingSchema, AU_DHA_CHILD_CAPACITY_AUD_SRC, "AU_DHA_CHILD_CAPACITY_AUD");
const repTuition = checked(RepresentativeTuitionSchema, AU_REPRESENTATIVE_TUITION_AUD_SRC, "AU_REPRESENTATIVE_TUITION_AUD");
const capacityGate = checked(DhaCapacityGateSchema, AU_DHA_CAPACITY_GATE_SRC, "AU_DHA_CAPACITY_GATE");
const dimWeights = checked(DimensionWeightsSchema, DIMENSION_WEIGHTS_SRC, "DIMENSION_WEIGHTS");
const verdictCutoffs = checked(VerdictCutoffsSchema, VERDICT_CUTOFFS_SRC, "VERDICT_CUTOFFS");
const profileStrength = checked(ProfileStrengthPointsSchema, PROFILE_STRENGTH_POINTS_SRC, "PROFILE_STRENGTH_POINTS");

const fxEntries = Object.entries(FX_RATES_SRC) as Array<[Currency, { value: number; provenance: Provenance }]>;
for (const [cur, s] of fxEntries) checked(FxRateSchema, s, `FX_RATES.${cur}`);

export const FIELD_COMPETITIVENESS: Readonly<Record<FieldOfStudy, number>> = Object.freeze(fieldComp.value);
export const LEVEL_BONUS: Readonly<Record<EducationLevel, number>> = Object.freeze(levelBonus.value);
export const FUNDING_RELIABILITY: Readonly<Record<FundingSource, number>> = Object.freeze(fundingRel.value);
export const FX_RATES: Readonly<Partial<Record<Currency, number>>> = Object.freeze(
  Object.fromEntries(fxEntries.map(([cur, s]) => [cur, s.value])) as Partial<Record<Currency, number>>,
);
export const ENGLISH_THRESHOLD_BY_DEST: Readonly<Record<Destination, number>> = Object.freeze(englishThreshold.value);
export const ENGLISH_VISA_FLOOR_BY_DEST: Readonly<Record<Destination, number>> = Object.freeze(englishVisaFloor.value);
export const GAP_REASON_WEIGHT: Readonly<Record<GapReason, number>> = Object.freeze(gapReasonWeight.value);
export const GAP_PENALTIES = Object.freeze(gapPenalties.value);
export const ENGLISH_NOT_TAKEN_PENALTY = englishNotTaken.value;
export const ENGLISH_BAND_DELTA_POINTS = englishBandDelta.value;
export const TYPICAL_YEARLY_USD: Readonly<Record<Destination, { min: number; max: number }>> = Object.freeze(
  typicalYearly.value,
);
export const AU_DHA_LIVING_CAPACITY_AUD = dhaLiving.value;
export const AU_DHA_PARTNER_CAPACITY_AUD = dhaPartner.value;
export const AU_DHA_CHILD_CAPACITY_AUD = dhaChild.value;
export const AU_REPRESENTATIVE_TUITION_AUD = repTuition.value;
export const AU_DHA_CAPACITY_GATE = Object.freeze(capacityGate.value);
export const DIMENSION_WEIGHTS = Object.freeze(dimWeights.value);
export const VERDICT_CUTOFFS = Object.freeze(verdictCutoffs.value);
export const PROFILE_STRENGTH_POINTS = Object.freeze(profileStrength.value);

/**
 * Bump when any sourced value changes; stamped onto results.
 * config-v2: financial dimension now consumes AU_DHA_LIVING_CAPACITY_AUD +
 * AU_REPRESENTATIVE_TUITION_AUD via the Australia DHA capacity gate.
 * config-v3: visa dimension now consumes ENGLISH_VISA_FLOOR_BY_DEST (the DHA
 * competent-English floor), distinct from the course-admission threshold; the
 * financial dimension now consumes AU_DHA_PARTNER_CAPACITY_AUD +
 * AU_DHA_CHILD_CAPACITY_AUD — declared dependents raise the DHA capacity floor.
 */
export const CONFIG_VERSION = "config-v3";

/** name → provenance, for explainability ("what backs this number?"). */
export const CONFIG_PROVENANCE: Readonly<Record<string, Provenance>> = Object.freeze({
  FIELD_COMPETITIVENESS: fieldComp.provenance,
  LEVEL_BONUS: levelBonus.provenance,
  FUNDING_RELIABILITY: fundingRel.provenance,
  FX_RATES: fxEntries[0]![1].provenance,
  ENGLISH_THRESHOLD_BY_DEST: englishThreshold.provenance,
  ENGLISH_VISA_FLOOR_BY_DEST: englishVisaFloor.provenance,
  GAP_REASON_WEIGHT: gapReasonWeight.provenance,
  GAP_PENALTIES: gapPenalties.provenance,
  ENGLISH_NOT_TAKEN_PENALTY: englishNotTaken.provenance,
  ENGLISH_BAND_DELTA_POINTS: englishBandDelta.provenance,
  TYPICAL_YEARLY_USD: typicalYearly.provenance,
  AU_DHA_LIVING_CAPACITY_AUD: dhaLiving.provenance,
  AU_DHA_PARTNER_CAPACITY_AUD: dhaPartner.provenance,
  AU_DHA_CHILD_CAPACITY_AUD: dhaChild.provenance,
  AU_REPRESENTATIVE_TUITION_AUD: repTuition.provenance,
  AU_DHA_CAPACITY_GATE: capacityGate.provenance,
  DIMENSION_WEIGHTS: dimWeights.provenance,
  VERDICT_CUTOFFS: verdictCutoffs.provenance,
  PROFILE_STRENGTH_POINTS: profileStrength.provenance,
});

/**
 * The verdict card's provenance floor (F16): the oldest `lastVerified` across
 * the dated CONFIG_PROVENANCE entries — every externally-sourced rule input was
 * verified on or after this date. Internal-heuristic entries carry no
 * `lastVerified` (nothing external to verify) and are excluded. Min, not max:
 * a max date would claim freshness most inputs don't have. Server-side only —
 * it rides the assessment payload (assemble), never a client import.
 */
export const CONFIG_RULES_VERIFIED: string = Object.values(CONFIG_PROVENANCE)
  .map((p) => p.lastVerified)
  .filter((d): d is string => Boolean(d))
  .sort()[0]!;
