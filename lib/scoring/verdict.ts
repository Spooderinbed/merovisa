import type { Verdict } from "./types";
import { VERDICT_CUTOFFS } from "@/lib/data/scoring-config";

export interface VerdictInput {
  weighted: number;
  dimensions: [number, number, number, number];
}

export function mapVerdict(input: VerdictInput): Verdict {
  const minDimension = Math.min(...input.dimensions);

  if (minDimension < VERDICT_CUTOFFS.minDimensionFloor) return "reach";
  if (input.weighted >= VERDICT_CUTOFFS.strongWeighted && minDimension >= VERDICT_CUTOFFS.strongMinDimension) {
    return "strong";
  }
  if (input.weighted >= VERDICT_CUTOFFS.possibleWeighted && minDimension >= VERDICT_CUTOFFS.minDimensionFloor) {
    return "possible";
  }
  return "reach";
}
