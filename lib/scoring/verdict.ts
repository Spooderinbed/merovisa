import type { Verdict } from "./types";

export interface VerdictInput {
  weighted: number;
  dimensions: [number, number, number, number];
}

export function mapVerdict(input: VerdictInput): Verdict {
  const minDimension = Math.min(...input.dimensions);

  if (minDimension < 30) return "reach";
  if (input.weighted >= 72 && minDimension >= 50) return "strong";
  if (input.weighted >= 50 && minDimension >= 30) return "possible";
  return "reach";
}
