import { describe, it, expect } from "vitest";
import { scoreAcademic } from "@/lib/scoring/academic";
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

describe("scoreAcademic", () => {
  it("returns a score between 0 and 100", () => {
    const result = scoreAcademic(baseProfile);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
  });

  it("scores higher for higher grades", () => {
    const low = scoreAcademic({ ...baseProfile, grade: 55 });
    const high = scoreAcademic({ ...baseProfile, grade: 85 });
    expect(high.value).toBeGreaterThan(low.value);
  });

  it("returns a positive factor for strong grades", () => {
    const result = scoreAcademic({ ...baseProfile, grade: 85 });
    expect(result.factors.some((f) => f.influence === "positive")).toBe(true);
  });

  it("returns a risk factor for low grades", () => {
    const result = scoreAcademic({ ...baseProfile, grade: 50 });
    expect(result.factors.some((f) => f.influence === "risk")).toBe(true);
  });

  it("penalises competitive fields slightly more", () => {
    const csScore = scoreAcademic({ ...baseProfile, fieldOfStudy: "computer-science", grade: 65 });
    const artsScore = scoreAcademic({ ...baseProfile, fieldOfStudy: "arts", grade: 65 });
    expect(artsScore.value).toBeGreaterThanOrEqual(csScore.value);
  });

  it("masters level scores higher than bachelors at same grade", () => {
    const bachelors = scoreAcademic({ ...baseProfile, educationLevel: "bachelors", grade: 70 });
    const masters = scoreAcademic({ ...baseProfile, educationLevel: "masters", grade: 70 });
    expect(masters.value).toBeGreaterThanOrEqual(bachelors.value);
  });
});
