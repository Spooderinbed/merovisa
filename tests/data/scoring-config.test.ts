import { describe, it, expect } from "vitest";
import * as Config from "@/lib/data/scoring-config";
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
} from "@/lib/data/schema/scoring-config.schema";
import {
  FIELD_COMPETITIVENESS as FIELD_COMPETITIVENESS_SRC,
  LEVEL_BONUS as LEVEL_BONUS_SRC,
} from "@/lib/data/policy/field-competitiveness";
import { FUNDING_RELIABILITY as FUNDING_RELIABILITY_SRC } from "@/lib/data/policy/funding-reliability";
import { FX_RATES as FX_RATES_SRC } from "@/lib/data/policy/fx-rates";
import {
  ENGLISH_THRESHOLD_BY_DEST as ENGLISH_THRESHOLD_BY_DEST_SRC,
  GAP_REASON_WEIGHT as GAP_REASON_WEIGHT_SRC,
  GAP_PENALTIES as GAP_PENALTIES_SRC,
  ENGLISH_NOT_TAKEN_PENALTY as ENGLISH_NOT_TAKEN_PENALTY_SRC,
  ENGLISH_BAND_DELTA_POINTS as ENGLISH_BAND_DELTA_POINTS_SRC,
} from "@/lib/data/policy/english-thresholds";
import {
  AU_DHA_LIVING_CAPACITY_AUD as AU_DHA_LIVING_CAPACITY_AUD_SRC,
  TYPICAL_YEARLY_USD as TYPICAL_YEARLY_USD_SRC,
  AU_REPRESENTATIVE_TUITION_AUD as AU_REPRESENTATIVE_TUITION_AUD_SRC,
  AU_DHA_CAPACITY_GATE as AU_DHA_CAPACITY_GATE_SRC,
} from "@/lib/data/policy/au-cost-of-living";
import {
  DIMENSION_WEIGHTS as DIMENSION_WEIGHTS_SRC,
  VERDICT_CUTOFFS as VERDICT_CUTOFFS_SRC,
  PROFILE_STRENGTH_POINTS as PROFILE_STRENGTH_POINTS_SRC,
} from "@/lib/data/policy/verdict-thresholds";

// The facade unwraps to values that MUST match the inline scorer constants
// byte-for-byte; Phase 5 swaps the read-path and the characterization goldens
// then prove zero delta. These pins are the Phase-4 guard before that swap.
describe("scoring config — literal pins", () => {
  it("academic tables", () => {
    expect(Config.FIELD_COMPETITIVENESS["computer-science"]).toBe(0.95);
    expect(Config.FIELD_COMPETITIVENESS["data-science"]).toBe(0.95);
    expect(Config.FIELD_COMPETITIVENESS.engineering).toBe(0.9);
    expect(Config.FIELD_COMPETITIVENESS.hospitality).toBe(0.7);
    expect(Config.FIELD_COMPETITIVENESS.other).toBe(0.8);
    expect(Config.LEVEL_BONUS.masters).toBe(6);
    expect(Config.LEVEL_BONUS.bachelors).toBe(0);
    expect(Config.LEVEL_BONUS["higher-secondary"]).toBe(-5);
  });

  it("financial tables", () => {
    expect(Config.FUNDING_RELIABILITY["self-funded"]).toBe(0.95);
    expect(Config.FUNDING_RELIABILITY["scholarship-dependent"]).toBe(0.55);
    expect(Config.FX_RATES.USD).toBe(1);
    expect(Config.FX_RATES.NPR).toBe(135);
    expect(Config.FX_RATES.AUD).toBe(1.5);
    expect(Config.TYPICAL_YEARLY_USD.australia).toEqual({ min: 30000, max: 55000 });
    expect(Config.TYPICAL_YEARLY_USD.germany).toEqual({ min: 12000, max: 22000 });
    expect(Config.AU_DHA_LIVING_CAPACITY_AUD).toBe(29_710);
    // DHA capacity gate inputs (Australia financial dimension). Changing either
    // shifts verdicts → regenerate the characterization golden + bump CONFIG_VERSION.
    expect(Config.AU_REPRESENTATIVE_TUITION_AUD).toBe(44_500);
    expect(Config.AU_DHA_CAPACITY_GATE).toEqual({ reachRatio: 0.75, blockStrongCap: 49, forceReachCap: 29 });
  });

  it("visa tables", () => {
    expect(Config.ENGLISH_THRESHOLD_BY_DEST.australia).toBe(6.5);
    expect(Config.ENGLISH_THRESHOLD_BY_DEST.germany).toBe(6.0);
    expect(Config.GAP_REASON_WEIGHT.worked).toBe(0.9);
    expect(Config.GAP_REASON_WEIGHT["health-family"]).toBe(0.5);
    expect(Config.GAP_PENALTIES).toEqual({ none: 8, upTo2: -6, upTo5: -14, beyond: -22 });
    expect(Config.ENGLISH_NOT_TAKEN_PENALTY).toBe(-8);
    expect(Config.ENGLISH_BAND_DELTA_POINTS).toBe(10);
  });

  it("engine / verdict / profile-strength tables", () => {
    expect(Config.DIMENSION_WEIGHTS).toEqual({ academic: 0.3, financial: 0.25, visa: 0.25, profileStrength: 0.2 });
    const w = Config.DIMENSION_WEIGHTS;
    expect(w.academic + w.financial + w.visa + w.profileStrength).toBeCloseTo(1, 10);
    expect(Config.VERDICT_CUTOFFS).toEqual({
      strongWeighted: 72,
      strongMinDimension: 50,
      possibleWeighted: 50,
      minDimensionFloor: 30,
    });
    expect(Config.PROFILE_STRENGTH_POINTS).toEqual({
      base: 55,
      masters: 18,
      bachelors: 8,
      work: 10,
      venture: 6,
      english75: 8,
      english70: 5,
    });
  });
});

describe("scoring config — schema validity", () => {
  it("every module parses under its Zod schema", () => {
    expect(FieldCompetitivenessSchema.safeParse(FIELD_COMPETITIVENESS_SRC).success).toBe(true);
    expect(LevelBonusSchema.safeParse(LEVEL_BONUS_SRC).success).toBe(true);
    expect(FundingReliabilitySchema.safeParse(FUNDING_RELIABILITY_SRC).success).toBe(true);
    for (const s of Object.values(FX_RATES_SRC)) expect(FxRateSchema.safeParse(s).success).toBe(true);
    expect(EnglishThresholdSchema.safeParse(ENGLISH_THRESHOLD_BY_DEST_SRC).success).toBe(true);
    expect(GapReasonWeightSchema.safeParse(GAP_REASON_WEIGHT_SRC).success).toBe(true);
    expect(GapPenaltiesSchema.safeParse(GAP_PENALTIES_SRC).success).toBe(true);
    expect(ScalarPenaltySchema.safeParse(ENGLISH_NOT_TAKEN_PENALTY_SRC).success).toBe(true);
    expect(ScalarPenaltySchema.safeParse(ENGLISH_BAND_DELTA_POINTS_SRC).success).toBe(true);
    expect(TypicalYearlySchema.safeParse(TYPICAL_YEARLY_USD_SRC).success).toBe(true);
    expect(DhaLivingSchema.safeParse(AU_DHA_LIVING_CAPACITY_AUD_SRC).success).toBe(true);
    expect(RepresentativeTuitionSchema.safeParse(AU_REPRESENTATIVE_TUITION_AUD_SRC).success).toBe(true);
    expect(DhaCapacityGateSchema.safeParse(AU_DHA_CAPACITY_GATE_SRC).success).toBe(true);
    expect(DimensionWeightsSchema.safeParse(DIMENSION_WEIGHTS_SRC).success).toBe(true);
    expect(VerdictCutoffsSchema.safeParse(VERDICT_CUTOFFS_SRC).success).toBe(true);
    expect(ProfileStrengthPointsSchema.safeParse(PROFILE_STRENGTH_POINTS_SRC).success).toBe(true);
  });

  it("rejects a value that is neither sourced nor an internal heuristic", () => {
    const bad = { value: 1, provenance: { findingRefs: [] } };
    expect(DhaLivingSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a malformed finding id in findingRefs", () => {
    const bad = { value: 1, provenance: { findingRefs: ["nope"] } };
    expect(DhaLivingSchema.safeParse(bad).success).toBe(false);
  });
});

describe("scoring config — provenance discipline", () => {
  it("every config value cites ≥1 finding or is tagged internal-heuristic", () => {
    for (const [name, p] of Object.entries(Config.CONFIG_PROVENANCE)) {
      const ok = p.findingRefs.length >= 1 || p.source === "internal-heuristic";
      expect(ok, `${name} provenance`).toBe(true);
    }
  });

  it("the DHA living figure is genuinely sourced to A.015 with its effective date", () => {
    const p = Config.CONFIG_PROVENANCE.AU_DHA_LIVING_CAPACITY_AUD!;
    expect(p.findingRefs).toContain("A.015");
    expect(p.effectiveDate).toBe("2024-05-10");
    expect(p.source).toMatch(/^https:\/\/immi\.homeaffairs\.gov\.au/);
  });

  it("exposes a config version", () => {
    expect(Config.CONFIG_VERSION).toMatch(/^config-/);
  });
});
