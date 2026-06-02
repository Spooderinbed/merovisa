import { describe, it, expect } from "vitest";
import { computeGapYears, GAP_REQUIRES_REASON_THRESHOLD } from "@/lib/scoring/gap";

describe("computeGapYears", () => {
  it("returns 0 for current-year graduation", () => {
    const now = new Date(2026, 5, 1);
    expect(computeGapYears(2026, now)).toBe(0);
  });

  it("returns positive years for past graduation", () => {
    const now = new Date(2026, 5, 1);
    expect(computeGapYears(2023, now)).toBe(3);
  });

  it("returns 0 (not negative) for future graduation", () => {
    const now = new Date(2026, 5, 1);
    expect(computeGapYears(2028, now)).toBe(0);
  });

  it("exports a threshold constant of 1", () => {
    expect(GAP_REQUIRES_REASON_THRESHOLD).toBe(1);
  });
});
