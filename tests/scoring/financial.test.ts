import { describe, it, expect } from "vitest";
import { scoreFinancial } from "@/lib/scoring/financial";
import {
  AU_DHA_LIVING_CAPACITY_AUD,
  AU_REPRESENTATIVE_TUITION_AUD,
  AU_DHA_PARTNER_CAPACITY_AUD,
  AU_DHA_CHILD_CAPACITY_AUD,
  AU_DHA_CAPACITY_GATE,
  FX_RATES,
} from "@/lib/data/scoring-config";
import type { StudentProfile } from "@/lib/scoring/types";

/**
 * The DHA capacity floor is a gov figure in AUD, but the gate compares it to a
 * budget in USD — so its USD expression moves whenever the FX rate is re-verified
 * (quarterly, MV-132). Derive the cliffs here instead of hardcoding USD literals:
 * a re-verified rate then moves these fixtures with it, rather than turning the
 * cliff tests red with numbers the next reader has to recompute by hand.
 */
const floorUsd = (extraAud = 0) =>
  (AU_DHA_LIVING_CAPACITY_AUD + AU_REPRESENTATIVE_TUITION_AUD + extraAud) / FX_RATES.AUD!;
const reachCliffUsd = (extraAud = 0) => floorUsd(extraAud) * AU_DHA_CAPACITY_GATE.reachRatio;

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
  budget: 4500000, // NPR 45 lakh ≈ USD 29k at the NRB rate (154.52 NPR/USD)
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
// (29,710) + AU_REPRESENTATIVE_TUITION_AUD (44,500) = 74,210 AUD — a gov figure, fixed.
// Its USD expression (≈51,935 at the current NRB rate) and the 0.75 reach cliff below
// it (≈38,951) both move when FX is re-verified, so tests derive them via floorUsd().
// The gate only ever LOWERS the dimension.
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
    const npr = scoreFinancial({ ...au, budget: 42500 * FX_RATES.NPR!, budgetCurrency: "NPR" });
    expect(npr.value).toBe(usd.value);
    expect(npr.value).toBe(49);
  });

  it("pins the capacity cliff: just-under caps to 49, just-over is uncapped", () => {
    expect(scoreFinancial({ ...au, budget: floorUsd() - 100 }).value).toBe(49);
    expect(scoreFinancial({ ...au, budget: floorUsd() + 100 }).value).toBeGreaterThan(49);
  });

  it("pins the reach cliff: above it caps to 49, below it caps to 29", () => {
    expect(scoreFinancial({ ...au, budget: reachCliffUsd() + 100 }).value).toBe(49);
    expect(scoreFinancial({ ...au, budget: reachCliffUsd() - 100 }).value).toBe(29);
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
// each child +AUD 4,449. Base floor 74,210 AUD; + partner → 84,604 AUD; + each child
// → +4,449 AUD. Budgets below are derived from those AUD figures via floorUsd(), so
// they track an FX re-verification. Applying alone (dependents omitted) must be
// byte-identical to today.
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
    // Just over the alone floor, so it is comfortably under the with-partner one.
    const budget = floorUsd() + 500;
    expect(scoreFinancial({ ...au, budget }).value).toBeGreaterThanOrEqual(50);
    const withPartner = scoreFinancial({ ...au, budget, dependents: { partner: true, children: 0 } });
    expect(withPartner.value).toBe(49);
    expect(withPartner.factors.some((f) => f.influence === "risk" && dhaFactor(f))).toBe(true);
    // The partner's own figure is what lifted the floor past this budget.
    expect(budget).toBeLessThan(floorUsd(AU_DHA_PARTNER_CAPACITY_AUD));
  });

  it("each child scales the floor: a budget clearing with one child caps with two", () => {
    // Between the one-child and two-child floors: one child clears, the second doesn't.
    const budget = floorUsd(AU_DHA_CHILD_CAPACITY_AUD) + 100;
    expect(
      scoreFinancial({ ...au, budget, dependents: { partner: false, children: 1 } }).value,
    ).toBeGreaterThanOrEqual(50);
    expect(
      scoreFinancial({ ...au, budget, dependents: { partner: false, children: 2 } }).value,
    ).toBe(49);
  });

  it("shifts the whole gate: a partner can push a block-strong budget down to a forced reach", () => {
    // Just above the alone reach cliff (→ 49); a partner lifts that cliff past the
    // same budget, so it now forces reach (→ 29).
    const budget = reachCliffUsd() + 500;
    expect(scoreFinancial({ ...au, budget }).value).toBe(49);
    expect(budget).toBeLessThan(reachCliffUsd(AU_DHA_PARTNER_CAPACITY_AUD));
    expect(scoreFinancial({ ...au, budget, dependents: { partner: true, children: 0 } }).value).toBe(29);
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
