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

  describe("grade-system normalization", () => {
    // Each CGPA value below maps to the equivalent percentage via grade/scaleMax*100,
    // so the academic score must match the percentage-system score exactly.
    it("scores a strong CGPA the same as its equivalent percentage", () => {
      const pctFour = scoreAcademic({ ...baseProfile, gradeSystem: "percentage", grade: 90 });
      const cgpaFour = scoreAcademic({ ...baseProfile, gradeSystem: "cgpa-4", grade: 3.6 });
      expect(cgpaFour.value).toBe(pctFour.value);

      const pctTen = scoreAcademic({ ...baseProfile, gradeSystem: "percentage", grade: 85 });
      const cgpaTen = scoreAcademic({ ...baseProfile, gradeSystem: "cgpa-10", grade: 8.5 });
      expect(cgpaTen.value).toBe(pctTen.value);

      const pctFive = scoreAcademic({ ...baseProfile, gradeSystem: "percentage", grade: 86 });
      const cgpaFive = scoreAcademic({ ...baseProfile, gradeSystem: "cgpa-5", grade: 4.3 });
      expect(cgpaFive.value).toBe(pctFive.value);
    });

    it("gives a strong CGPA a high, non-floored academic score with a positive factor", () => {
      // Pre-fix this profile scored 0 (3.6 read as 3.6%), forcing reach.
      const result = scoreAcademic({ ...baseProfile, gradeSystem: "cgpa-4", grade: 3.6 });
      expect(result.value).toBeGreaterThan(70);
      expect(result.factors.some((f) => f.influence === "positive")).toBe(true);
    });

    it("leaves percentage systems unchanged", () => {
      const nepal = scoreAcademic({ ...baseProfile, gradeSystem: "percentage-nepal", grade: 72 });
      const india = scoreAcademic({ ...baseProfile, gradeSystem: "percentage-india", grade: 72 });
      const generic = scoreAcademic({ ...baseProfile, gradeSystem: "percentage", grade: 72 });
      expect(nepal.value).toBe(india.value);
      expect(nepal.value).toBe(generic.value);
    });

    it("still scores a weak CGPA low, with a risk factor", () => {
      // 2.0/4.0 → 50%, well below the CS threshold.
      const result = scoreAcademic({ ...baseProfile, gradeSystem: "cgpa-4", grade: 2.0 });
      const equivalent = scoreAcademic({ ...baseProfile, gradeSystem: "percentage", grade: 50 });
      expect(result.value).toBe(equivalent.value);
      expect(result.value).toBeLessThan(50);
      expect(result.factors.some((f) => f.influence === "risk")).toBe(true);
    });
  });
});
