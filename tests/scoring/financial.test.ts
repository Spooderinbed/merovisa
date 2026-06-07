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

  it("attaches the DHA government source to the capacity factor (every band)", () => {
    for (const budget of [60000, 42500, 30000]) {
      const f = scoreFinancial({ ...au, budget }).factors.find(dhaFactor);
      expect(f, `budget ${budget}`).toBeDefined();
      expect(f!.source?.url).toMatch(/^https:\/\/immi\.homeaffairs\.gov\.au/);
      expect(f!.source?.lastVerified).toBe("2026-06-07");
    }
  });

  it("does not attach a source to the heuristic budget-range factor", () => {
    const budgetFactor = scoreFinancial({ ...au, budget: 60000 }).factors.find((f) =>
      /typical range/i.test(f.label),
    );
    expect(budgetFactor?.source).toBeUndefined();
  });
});

// B2 — dependents raise the DHA financial-capacity floor (Australia). The gov
// Subclass 500 figures already exist in au-cost-of-living.ts: partner +AUD 10,394,
// each child +AUD 4,449. Base floor 74,210 AUD ≈ 49,473 USD (÷1.5); + partner →
// 84,604 AUD ≈ 56,403 USD; + each child → +4,449 AUD (≈ +2,966 USD). Applying
// alone (dependents omitted) must be byte-identical to today.
describe("scoreFinancial — dependents raise the DHA capacity floor (Australia)", () => {
  const au: StudentProfile = {
    ...baseProfile,
    destination: "australia",
    budgetCurrency: "USD",
    fundingSource: "self-funded",
  };
  const dhaFactor = (f: { label: string; detail: string }) => /capacit|DHA/i.test(f.label + f.detail);

  it("treats applying alone as identical to omitting dependents (zero is a no-op)", () => {
    const omitted = scoreFinancial({ ...au, budget: 52000 });
    const alone = scoreFinancial({ ...au, budget: 52000, dependents: { partner: false, children: 0 } });
    expect(alone).toEqual(omitted);
  });

  it("a partner raises the floor: a budget that clears alone is capped to 49 with a partner", () => {
    // 52,000 USD clears the 49,473 alone floor but falls under the 56,403 with-partner floor.
    expect(scoreFinancial({ ...au, budget: 52000 }).value).toBeGreaterThanOrEqual(50);
    const withPartner = scoreFinancial({ ...au, budget: 52000, dependents: { partner: true, children: 0 } });
    expect(withPartner.value).toBe(49);
    expect(withPartner.factors.some((f) => f.influence === "risk" && dhaFactor(f))).toBe(true);
  });

  it("each child scales the floor: a budget clearing with one child caps with two", () => {
    expect(
      scoreFinancial({ ...au, budget: 54000, dependents: { partner: false, children: 1 } }).value,
    ).toBeGreaterThanOrEqual(50);
    expect(
      scoreFinancial({ ...au, budget: 54000, dependents: { partner: false, children: 2 } }).value,
    ).toBe(49);
  });

  it("shifts the whole gate: a partner can push a block-strong budget down to a forced reach", () => {
    // 40,000 USD: alone it's above the 37,105 reach cliff (→ 49); a partner lifts
    // the reach cliff to 42,302, so 40,000 now forces reach (→ 29).
    expect(scoreFinancial({ ...au, budget: 40000 }).value).toBe(49);
    expect(scoreFinancial({ ...au, budget: 40000, dependents: { partner: true, children: 0 } }).value).toBe(29);
  });

  it("credits the family floor honestly in the cleared capacity factor", () => {
    const f = scoreFinancial({ ...au, budget: 90000, dependents: { partner: true, children: 0 } }).factors.find(
      (x) => x.influence === "positive" && dhaFactor(x),
    );
    expect(f).toBeDefined();
    expect(f!.detail).toMatch(/84,604/); // the raised floor (74,210 + 10,394 partner)
    expect(f!.detail).toMatch(/family/i);
  });

  it("does not mention family in a no-dependents factor (base output stays byte-identical)", () => {
    const f = scoreFinancial({ ...au, budget: 90000 }).factors.find((x) => x.influence === "positive" && dhaFactor(x));
    expect(f!.detail).toMatch(/74,210/);
    expect(f!.detail).not.toMatch(/family/i);
  });
});
