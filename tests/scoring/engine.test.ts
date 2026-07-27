import { describe, it, expect } from "vitest";
import { runAssessment } from "@/lib/scoring/engine";
import { CONFIG_VERSION } from "@/lib/data/scoring-config";
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

describe("runAssessment", () => {
  it("returns a complete assessment with verdict and four dimensions", () => {
    const result = runAssessment(baseProfile);
    expect(["strong", "possible", "reach"]).toContain(result.verdict);
    expect(result.weighted).toBeGreaterThanOrEqual(0);
    expect(result.weighted).toBeLessThanOrEqual(100);
    expect(result.dimensions.academic.value).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.financial.value).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.visa.value).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.profileStrength.value).toBeGreaterThanOrEqual(0);
  });

  it("uses the documented weights (academic 30, financial 25, visa 25, profileStrength 20)", () => {
    const result = runAssessment(baseProfile);
    const manual =
      result.dimensions.academic.value * 0.3 +
      result.dimensions.financial.value * 0.25 +
      result.dimensions.visa.value * 0.25 +
      result.dimensions.profileStrength.value * 0.2;
    expect(Math.abs(result.weighted - Math.round(manual))).toBeLessThanOrEqual(1);
  });

  it("includes a rule version and timestamp", () => {
    const result = runAssessment(baseProfile);
    expect(result.ruleVersion).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(() => new Date(result.computedAt)).not.toThrow();
  });

  it("stamps the active config version onto the result", () => {
    // The config version records which sourced data figures backed this verdict,
    // so an old assessment stays explainable when a number later changes.
    const result = runAssessment(baseProfile);
    expect(result.configVersion).toBe(CONFIG_VERSION);
    expect(result.configVersion).toMatch(/^config-v\d+$/);
  });

  it("returns 'strong' for a clearly qualified profile", () => {
    const strong = runAssessment({
      ...baseProfile,
      grade: 85,
      englishScore: 7.5,
      // ≈55k USD — clears the AU DHA capacity floor (≈51.9k USD); a genuinely
      // strong Australia profile must be able to show the visa's financial capacity.
      // MV-132 raised this from 7M NPR: at the corrected NRB rate 7M is only ≈45k
      // USD, under the floor, so the gate capped financial and this stopped being
      // 'strong' — the fixture is about the strong band, not about FX.
      budget: 8500000,
      fundingSource: "self-funded",
      educationLevel: "masters",
      graduationYear: new Date().getFullYear(),
    });
    expect(strong.verdict).toBe("strong");
  });

  it("returns 'reach' for a clearly under-qualified profile", () => {
    const reach = runAssessment({
      ...baseProfile,
      grade: 48,
      englishStatus: "not-taken",
      englishScore: undefined,
      budget: 1200000,
      fundingSource: "scholarship-dependent",
      graduationYear: 2018,
      gapReasons: ["health-family"],
    });
    expect(reach.verdict).toBe("reach");
  });
});
