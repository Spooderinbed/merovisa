import { describe, it, expect } from "vitest";
import { scoreFinancial } from "@/lib/scoring/financial";
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
  budget: 4500000, // NPR 45 lakh ≈ USD 33k at 135 NPR/USD
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("scoreFinancial", () => {
  it("returns a score between 0 and 100", () => {
    const result = scoreFinancial(baseProfile);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
  });

  it("scores higher for larger budgets", () => {
    const low = scoreFinancial({ ...baseProfile, budget: 2000000 });
    const high = scoreFinancial({ ...baseProfile, budget: 8000000 });
    expect(high.value).toBeGreaterThan(low.value);
  });

  it("handles USD budget input equivalently to NPR", () => {
    const npr = scoreFinancial({ ...baseProfile, budget: 4500000, budgetCurrency: "NPR" });
    const usd = scoreFinancial({ ...baseProfile, budget: 33000, budgetCurrency: "USD" });
    expect(Math.abs(npr.value - usd.value)).toBeLessThanOrEqual(3);
  });

  it("rewards parents-family funding over scholarship-dependent", () => {
    const family = scoreFinancial({ ...baseProfile, fundingSource: "parents-family" });
    const scholarship = scoreFinancial({ ...baseProfile, fundingSource: "scholarship-dependent" });
    expect(family.value).toBeGreaterThan(scholarship.value);
  });

  it("flags scholarship-dependent as a risk factor", () => {
    const result = scoreFinancial({ ...baseProfile, fundingSource: "scholarship-dependent" });
    expect(result.factors.some((f) => f.influence === "risk")).toBe(true);
  });

  it("flags a low budget as a risk factor", () => {
    const result = scoreFinancial({ ...baseProfile, budget: 1500000 });
    expect(result.factors.some((f) => f.influence === "risk")).toBe(true);
  });
});
