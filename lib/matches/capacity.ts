import {
  AU_DHA_LIVING_CAPACITY_AUD,
  AU_DHA_CAPACITY_GATE,
} from "@/lib/data/scoring-config";
import { auDependentsCapacityAud } from "@/lib/scoring/financial";
import type { StudentProfile } from "@/lib/scoring/types";
import type { FinancialCapacity } from "./types";

/**
 * The Australia financial-capacity model handed to the matches engine.
 *
 * This is the single seam through which the DHA constants reach `computeMatches`. Both
 * adapters (anonymous `from-student-profile` and signed-in `from-sections`) call it, so
 * neither wires the constants itself — the duplication that let the matcher and
 * lib/scoring/financial.ts drift into contradicting each other on the same budget is what
 * MV-120 / audit C-3 fixed, and one seam is what keeps them from drifting again.
 *
 * Note the engines still ask different questions, correctly: `financial.ts` scores the
 * student against a REPRESENTATIVE (median) tuition to judge the destination generally,
 * while the matcher judges THIS program's `tuitionMin`. What they share is the living
 * floor, the dependants pricing, and the band ratio — never the tuition figure.
 */
export function auFinancialCapacity(dependents: StudentProfile["dependents"]): FinancialCapacity {
  return {
    livingAud: AU_DHA_LIVING_CAPACITY_AUD,
    dependentsAud: auDependentsCapacityAud(dependents),
    reachRatio: AU_DHA_CAPACITY_GATE.reachRatio,
  };
}
