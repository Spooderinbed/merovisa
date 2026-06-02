import { describe, it, expect } from "vitest";
import { scoreVisa } from "@/lib/scoring/visa";
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

const currentYear = new Date().getFullYear();

describe("scoreVisa", () => {
  it("returns a score between 0 and 100", () => {
    const result = scoreVisa(baseProfile);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
  });

  it("scores higher for recent graduates than for long gaps", () => {
    const recent = scoreVisa({ ...baseProfile, graduationYear: currentYear, gapReasons: [] });
    const longGap = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 6,
      gapReasons: ["worked"],
    });
    expect(recent.value).toBeGreaterThan(longGap.value);
  });

  it("scores higher when gap is explained by work", () => {
    const explained = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 2,
      gapReasons: ["worked"],
    });
    const unexplained = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 2,
      gapReasons: ["health-family"],
    });
    expect(explained.value).toBeGreaterThan(unexplained.value);
  });

  it("rewards IELTS at or above 6.5 for Australia", () => {
    const low = scoreVisa({ ...baseProfile, englishScore: 6.0 });
    const ok = scoreVisa({ ...baseProfile, englishScore: 7.0 });
    expect(ok.value).toBeGreaterThan(low.value);
  });

  it("flags long unexplained gap as risk", () => {
    const result = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 5,
      gapReasons: ["health-family"],
    });
    expect(result.factors.some((f) => f.influence === "risk")).toBe(true);
  });
});
