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
