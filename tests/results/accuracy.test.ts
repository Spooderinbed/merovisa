import { describe, it, expect } from "vitest";
import { computeProfileAccuracy } from "@/lib/results/accuracy";
import type { StudentProfile } from "@/lib/scoring/types";

const base: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: 2025,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("computeProfileAccuracy", () => {
  it("reports Basic with two enrichment suggestions when English is taken", () => {
    const a = computeProfileAccuracy(base);
    expect(a.level).toBe("Basic");
    expect(a.completeness).toBe(28);
    expect(a.suggestions).toHaveLength(2);
  });

  it("suggests verifying English when it has not been taken", () => {
    const a = computeProfileAccuracy({ ...base, englishStatus: "not-taken", englishScore: undefined });
    expect(a.completeness).toBe(25);
    const english = a.suggestions.find((s) => s.id === "english");
    expect(english?.label).toBe("Verify your English score");
    // Read-through F5: an unverified score can't promise eligibility — only band-level checking.
    expect(english?.gain).toBe("band-level verification");
  });
});
