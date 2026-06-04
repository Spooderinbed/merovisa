import { describe, test, expect } from "vitest";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import type { StudentProfile } from "@/lib/scoring/types";

describe("ProfileSections <-> StudentProfile enum round-trip", () => {
  const original: StudentProfile = {
    homeCountry: "nepal",
    destination: "australia",
    educationLevel: "higher-secondary",
    gradeSystem: "percentage-nepal",
    grade: 72,
    fieldOfStudy: "computer-science",
    graduationYear: 2025,
    gapReasons: ["worked", "health-family"],
    englishStatus: "taken",
    englishScore: 6.5,
    budget: 3_000_000,
    budgetCurrency: "NPR",
    fundingSource: "parents-family",
    goal: "permanent-residency",
  };

  test("round-trips without value drift", () => {
    const sections = profileSectionsFromAssessment(
      original as unknown as Record<string, unknown>,
      {},
      { nowYear: 2026 },
    );
    const recovered = sectionsToStudentProfile(sections);
    expect(recovered.educationLevel).toBe(original.educationLevel);
    expect(recovered.fieldOfStudy).toBe(original.fieldOfStudy);
    expect(recovered.gapReasons).toEqual(original.gapReasons);
    expect(recovered.fundingSource).toBe(original.fundingSource);
    expect(recovered.goal).toBe(original.goal);
    expect(recovered.budgetCurrency).toBe(original.budgetCurrency);
  });
});
