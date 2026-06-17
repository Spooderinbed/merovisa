import { describe, it, expect } from "vitest";
import { toIeltsEquivalent } from "@/lib/scoring/english-equivalent";

describe("toIeltsEquivalent", () => {
  it("passes IELTS through unchanged", () => {
    expect(toIeltsEquivalent(6.5, "ielts")).toBe(6.5);
    expect(toIeltsEquivalent(7.0, "ielts")).toBe(7.0);
    expect(toIeltsEquivalent(5.5, "ielts")).toBe(5.5);
  });

  it("treats an omitted test as IELTS (back-compat default)", () => {
    expect(toIeltsEquivalent(6.5, undefined)).toBe(6.5);
    expect(toIeltsEquivalent(8.0, undefined)).toBe(8.0);
  });

  it("maps a PTE 58 to IELTS 6.5 (audit's worked example)", () => {
    expect(toIeltsEquivalent(58, "pte")).toBe(6.5);
  });

  it("maps the PTE DHA competent-English floor (50) to IELTS 6.0", () => {
    expect(toIeltsEquivalent(50, "pte")).toBe(6.0);
  });

  it("maps PTE 65 to IELTS 7.0", () => {
    expect(toIeltsEquivalent(65, "pte")).toBe(7.0);
  });

  it("maps the TOEFL DHA competent-English floor (60) to IELTS 6.0", () => {
    expect(toIeltsEquivalent(60, "toefl")).toBe(6.0);
  });

  it("maps a TOEFL 79 to IELTS 6.5", () => {
    expect(toIeltsEquivalent(79, "toefl")).toBe(6.5);
  });

  it("maps TOEFL 94 to IELTS 7.0", () => {
    expect(toIeltsEquivalent(94, "toefl")).toBe(7.0);
  });

  it("clamps below-range scores to the lowest anchor band", () => {
    expect(toIeltsEquivalent(10, "pte")).toBe(4.5);
    expect(toIeltsEquivalent(20, "toefl")).toBe(4.5);
  });

  it("clamps above-range scores to the highest anchor band", () => {
    expect(toIeltsEquivalent(90, "pte")).toBe(9.0);
    expect(toIeltsEquivalent(120, "toefl")).toBe(9.0);
  });

  it("rounds interpolated values to the nearest 0.5 band", () => {
    const v = toIeltsEquivalent(54, "pte"); // between 50→6.0 and 58→6.5
    expect(v % 0.5).toBe(0);
  });

  it("is monotonic in the raw score for each test", () => {
    for (const test of ["pte", "toefl"] as const) {
      let prev = -Infinity;
      for (let raw = 30; raw <= 90; raw += 1) {
        const v = toIeltsEquivalent(raw, test);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });
});
