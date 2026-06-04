import { describe, test, expect } from "vitest";
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
import type { ProfileSections } from "@/lib/profiles/sections";

describe("sectionsToMatchInputs", () => {
  const policy = { nepalAssessmentLevel: "L3" as const };

  test("maps full profile to MatchInputs", () => {
    const sections: ProfileSections = {
      academic: { gradePercent: 75 },
      english: { test: "ielts", overall: 7.0, listening: 7.5, reading: 6.5, writing: 6.5, speaking: 7.0 },
      finance: { total: 3_000_000, currency: "NPR" },
      "intended-study": { field: "computer-science" },
    };
    const result = sectionsToMatchInputs(sections, policy);
    expect(result.userGradePercent).toBe(75);
    expect(result.userEnglishOverall).toBe(7.0);
    expect(result.userEnglishBand).toBe(6.5);
    expect(result.userBudgetAud).toBeCloseTo(30000, -2);
    expect(result.userField).toBe("computer-science");
    expect(result.policy.nepalAssessmentLevel).toBe("L3");
  });

  test("uses overall as band proxy when per-band missing", () => {
    const sections: ProfileSections = {
      english: { test: "ielts", overall: 6.5 },
    };
    const result = sectionsToMatchInputs(sections, policy);
    expect(result.userEnglishBand).toBe(6.5);
  });

  test("returns nulls for empty sections", () => {
    const result = sectionsToMatchInputs({}, policy);
    expect(result.userGradePercent).toBeNull();
    expect(result.userEnglishOverall).toBeNull();
    expect(result.userEnglishBand).toBeNull();
    expect(result.userBudgetAud).toBeNull();
    expect(result.userField).toBeNull();
  });
});
