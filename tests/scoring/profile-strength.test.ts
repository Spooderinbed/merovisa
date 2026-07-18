import { describe, it, expect } from "vitest";
import { scoreProfileStrength } from "@/lib/scoring/profile-strength";
import type { StudentProfile } from "@/lib/scoring/types";

const baseProfile: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: 2025,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7.0,
  destination: "australia",
  budget: 4500000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("scoreProfileStrength", () => {
  it("returns a score between 0 and 100", () => {
    const result = scoreProfileStrength(baseProfile);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
  });

  it("masters score higher than higher-secondary", () => {
    const hs = scoreProfileStrength({ ...baseProfile, educationLevel: "higher-secondary" });
    const masters = scoreProfileStrength({ ...baseProfile, educationLevel: "masters" });
    expect(masters.value).toBeGreaterThan(hs.value);
  });

  it("work-gap reasons add to profile strength", () => {
    const noWork = scoreProfileStrength({ ...baseProfile, gapReasons: [] });
    const withWork = scoreProfileStrength({
      ...baseProfile,
      graduationYear: new Date().getFullYear() - 1,
      gapReasons: ["worked"],
    });
    expect(withWork.value).toBeGreaterThanOrEqual(noWork.value);
  });

  it("acknowledges work experience as positive", () => {
    const result = scoreProfileStrength({
      ...baseProfile,
      graduationYear: new Date().getFullYear() - 1,
      gapReasons: ["worked"],
    });
    expect(result.factors.some((f) => f.influence === "positive" && /work/i.test(f.label))).toBe(
      true,
    );
  });
});

describe("scoreProfileStrength with englishTest conversion", () => {
  // englishScore lives in the test's OWN scale (PTE 10–90, TOEFL 0–120). It must be
  // converted to an IELTS band before the 7.5/7.0 strong-English thresholds — otherwise
  // a raw PTE 58 (≈ IELTS 6.5) reads as ">= 7.5" and EVERY PTE/TOEFL taker is silently
  // over-awarded the bonus. Mirrors tests/scoring/english-test-type.test.ts (visa).
  it("does not over-award the strong-English bonus for a PTE 58 (IELTS 6.5)", () => {
    const ielts65 = scoreProfileStrength({ ...baseProfile, englishScore: 6.5 });
    const pte58 = scoreProfileStrength({ ...baseProfile, englishTest: "pte", englishScore: 58 });
    expect(pte58.value).toBe(ielts65.value);
  });

  it("does not over-award the strong-English bonus for a TOEFL 79 (IELTS 6.5)", () => {
    const ielts65 = scoreProfileStrength({ ...baseProfile, englishScore: 6.5 });
    const toefl79 = scoreProfileStrength({
      ...baseProfile,
      englishTest: "toefl",
      englishScore: 79,
    });
    expect(toefl79.value).toBe(ielts65.value);
  });

  it("scores a PTE 73 identically to an IELTS 7.5, factors and all", () => {
    const ielts = scoreProfileStrength({ ...baseProfile, englishScore: 7.5 });
    const pte = scoreProfileStrength({ ...baseProfile, englishTest: "pte", englishScore: 73 });
    expect(pte.value).toBe(ielts.value);
    expect(pte.factors).toEqual(ielts.factors);
  });

  it("labels the English factor as the IELTS-equivalent band, never the raw test score", () => {
    const pte = scoreProfileStrength({ ...baseProfile, englishTest: "pte", englishScore: 73 });
    const factor = pte.factors.find((f) => /English/i.test(f.label));
    expect(factor?.label).toBe("Strong English (7.5)");
  });

  it("an explicit englishTest 'ielts' behaves like an omitted one", () => {
    const omitted = scoreProfileStrength({ ...baseProfile, englishScore: 7.5 });
    const explicit = scoreProfileStrength({
      ...baseProfile,
      englishTest: "ielts",
      englishScore: 7.5,
    });
    expect(explicit).toEqual(omitted);
  });
});
