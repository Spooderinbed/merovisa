import { describe, it, expect } from "vitest";
import { runAssessment } from "@/lib/scoring/engine";
import type { StudentProfile } from "@/lib/scoring/types";

const base: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: 2024,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("alsoConsidering is inert to scoring", () => {
  it("does not change the verdict, weighted score, or academic dimension", () => {
    const without = runAssessment(base);
    const with2 = runAssessment({ ...base, alsoConsidering: ["business", "arts"] });
    expect(with2.verdict).toBe(without.verdict);
    expect(with2.weighted).toBe(without.weighted);
    expect(with2.dimensions.academic.value).toBe(without.dimensions.academic.value);
  });
});
