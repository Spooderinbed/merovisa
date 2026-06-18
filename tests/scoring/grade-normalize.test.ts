import { describe, it, expect } from "vitest";
import { normalizeGradeToPercentage } from "@/lib/scoring/grade-normalize";
import { GRADE_SYSTEMS } from "@/lib/scoring/types";

describe("normalizeGradeToPercentage", () => {
  it("passes percentage systems through unchanged (0-100)", () => {
    expect(normalizeGradeToPercentage(72, "percentage-nepal")).toBe(72);
    expect(normalizeGradeToPercentage(85, "percentage-india")).toBe(85);
    expect(normalizeGradeToPercentage(60, "percentage")).toBe(60);
  });

  it("converts cgpa-4 to a 0-100 scale via grade/scaleMax*100", () => {
    expect(normalizeGradeToPercentage(4, "cgpa-4")).toBe(100);
    expect(normalizeGradeToPercentage(3.6, "cgpa-4")).toBe(90);
    expect(normalizeGradeToPercentage(2, "cgpa-4")).toBe(50);
  });

  it("converts cgpa-10 to a 0-100 scale", () => {
    expect(normalizeGradeToPercentage(10, "cgpa-10")).toBe(100);
    expect(normalizeGradeToPercentage(8.5, "cgpa-10")).toBe(85);
    expect(normalizeGradeToPercentage(5, "cgpa-10")).toBe(50);
  });

  it("converts cgpa-5 to a 0-100 scale", () => {
    expect(normalizeGradeToPercentage(5, "cgpa-5")).toBe(100);
    expect(normalizeGradeToPercentage(4.3, "cgpa-5")).toBe(86);
    expect(normalizeGradeToPercentage(2.5, "cgpa-5")).toBe(50);
  });

  it("clamps converted values into 0-100 and never returns NaN", () => {
    for (const system of GRADE_SYSTEMS) {
      const v = normalizeGradeToPercentage(999, system);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      expect(Number.isNaN(v)).toBe(false);
    }
    expect(normalizeGradeToPercentage(-1, "cgpa-4")).toBe(0);
  });

  it("is a pure function — equal inputs give equal outputs", () => {
    expect(normalizeGradeToPercentage(3.6, "cgpa-4")).toBe(
      normalizeGradeToPercentage(3.6, "cgpa-4"),
    );
  });
});
