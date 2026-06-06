// lib/programs/policy.ts
//
// Constants from docs/research/2026-06-04-nepal-australia-data.md
// Update these when the underlying DHA / university policy changes.
import {
  AU_DHA_LIVING_CAPACITY_AUD,
  AU_DHA_PARTNER_CAPACITY_AUD,
  AU_DHA_CHILD_CAPACITY_AUD,
  AU_DHA_SCHOOL_COSTS_AUD,
} from "@/lib/data/policy/au-cost-of-living";
import { NEPAL_AU_STUDENT_VISA_GRANT_RATE_BAND } from "@/lib/data/policy/visa-outcomes";

export const NEPAL_ASSESSMENT_LEVEL = "L3" as const;
export const NEPAL_ASSESSMENT_LEVEL_EFFECTIVE = "2026-01-09" as const;

// Single source of truth: the DHA living figure lives in the sourced config layer
// (finding A.015). Re-exported here so existing consumers keep compiling.
export const DHA_LIVING_COSTS_AUD = AU_DHA_LIVING_CAPACITY_AUD.value;
export const DHA_LIVING_COSTS_AUD_EFFECTIVE = "2024-05-10" as const;

// Sourced to the DHA dependant/school figures (findings B.003/B.004/B.005).
export const DHA_PARTNER_COSTS_AUD = AU_DHA_PARTNER_CAPACITY_AUD.value;
export const DHA_CHILD_COSTS_AUD = AU_DHA_CHILD_CAPACITY_AUD.value;
export const DHA_SCHOOLING_COSTS_AUD = AU_DHA_SCHOOL_COSTS_AUD.value;

// Nepal TU percentage → Australian WAM band (used by scoring engine)
export const NEPAL_TU_TO_AU_WAM: Array<{ minTuPct: number; auWam: string; auGrade: string }> = [
  { minTuPct: 80, auWam: ">=75",  auGrade: "Distinction" },
  { minTuPct: 70, auWam: "65-74", auGrade: "Credit" },
  { minTuPct: 60, auWam: "50-64", auGrade: "Pass" },
  { minTuPct: 0,  auWam: "<50",   auGrade: "Fail" },
];

export function tuPctToAuWamBand(tuPct: number): { auWam: string; auGrade: string } {
  for (const row of NEPAL_TU_TO_AU_WAM) {
    if (tuPct >= row.minTuPct) return { auWam: row.auWam, auGrade: row.auGrade };
  }
  return NEPAL_TU_TO_AU_WAM[NEPAL_TU_TO_AU_WAM.length - 1]!;
}

// Nepal → Australia student-visa grant rate (DHA, quarter Apr–Jun 2025), sourced
// to findings I.032 (offshore) / I.033 (onshore). Surface in UI as a range,
// never a single number.
const _grantRate = NEPAL_AU_STUDENT_VISA_GRANT_RATE_BAND.value;
export const NEPAL_AU_VISA_GRANT_RATE_BAND: [number, number] = [_grantRate.min, _grantRate.max]; // percent

// Bank statement seasoning recommendation under Level 3 (research §4.3)
export const NEPAL_L3_BANK_SEASONING_MONTHS = 6;
