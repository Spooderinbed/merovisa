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
    // Budget clears the AU DHA capacity floor (≈49,473 USD ≈ 6.68M NPR) so the
    // capacity gate doesn't cap both to the same floor — funding differentiation
    // is only observable above the floor, which is the intended behaviour.
    const cleared = { ...baseProfile, budget: 9_000_000 };
    const family = scoreFinancial({ ...cleared, fundingSource: "parents-family" });
    const scholarship = scoreFinancial({ ...cleared, fundingSource: "scholarship-dependent" });
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

// DHA financial-capacity gate (Australia only). Capacity = AU_DHA_LIVING_CAPACITY_AUD
// (29,710) + AU_REPRESENTATIVE_TUITION_AUD (44,500) = 74,210 AUD ≈ 49,473 USD (÷1.5).
// Reach cliff at 0.75 → 37,105 USD. The gate only ever LOWERS the dimension.
describe("scoreFinancial — DHA capacity gate (Australia)", () => {
  // self-funded + USD so budgetUsd === budget and funding reliability is constant.
  const au: StudentProfile = {
    ...baseProfile,
    destination: "australia",
    budgetCurrency: "USD",
    fundingSource: "self-funded",
  };
  const dhaFactor = (f: { label: string; detail: string }) => /capacit|DHA/i.test(f.label + f.detail);

  it("does not cap a budget that clears DHA capacity, and adds a positive capacity factor", () => {
    const result = scoreFinancial({ ...au, budget: 60000 });
    expect(result.value).toBeGreaterThanOrEqual(50); // can still be 'strong'
    expect(result.factors.some((f) => f.influence === "positive" && dhaFactor(f))).toBe(true);
  });

  it("caps the dimension at 49 (blocks 'strong') when budget is below capacity but above the reach cliff", () => {
    const result = scoreFinancial({ ...au, budget: 42500 });
    expect(result.value).toBe(49);
    expect(result.factors.some((f) => f.influence === "risk" && dhaFactor(f))).toBe(true);
  });

  it("caps the dimension at 29 (forces 'reach') when budget is well below capacity", () => {
    const result = scoreFinancial({ ...au, budget: 30000 });
    expect(result.value).toBe(29);
    expect(result.factors.some((f) => f.influence === "risk" && dhaFactor(f))).toBe(true);
  });

  it("does NOT gate non-Australia destinations at the same budget", () => {
    const result = scoreFinancial({ ...au, destination: "canada", budget: 42500 });
    expect(result.value).toBeGreaterThan(49); // uncapped — AU would be 49 here
    expect(result.factors.some(dhaFactor)).toBe(false);
  });

  it("gates an NPR budget identically to its USD equivalent (conversion happens first)", () => {
    const usd = scoreFinancial({ ...au, budget: 42500, budgetCurrency: "USD" });
    const npr = scoreFinancial({ ...au, budget: 42500 * 135, budgetCurrency: "NPR" });
    expect(npr.value).toBe(usd.value);
    expect(npr.value).toBe(49);
  });

  it("pins the capacity cliff: just-under caps to 49, just-over is uncapped", () => {
    expect(scoreFinancial({ ...au, budget: 49400 }).value).toBe(49);
    expect(scoreFinancial({ ...au, budget: 49500 }).value).toBeGreaterThan(49);
  });

  it("pins the reach cliff: above it caps to 49, below it caps to 29", () => {
    expect(scoreFinancial({ ...au, budget: 37200 }).value).toBe(49);
    expect(scoreFinancial({ ...au, budget: 37000 }).value).toBe(29);
  });
});
