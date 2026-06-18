import { describe, it, expect } from "vitest";
import { profileToMatchInputs } from "@/lib/matches/from-student-profile";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
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

describe("profileToMatchInputs", () => {
  it("normalizes a CGPA grade to a percentage so it reaches the scorer (the funnel GPA bug)", () => {
    // 3.5 / 4.0 = 87.5% — without normalization this collapses to 3.5 and forces every match to 'reach'.
    const inputs = profileToMatchInputs({ ...base, gradeSystem: "cgpa-4", grade: 3.5 });
    expect(inputs.userGradePercent).toBe(87.5);
  });

  it("passes a percentage grade through unchanged", () => {
    expect(profileToMatchInputs(base).userGradePercent).toBe(72);
  });

  it("uses the taken English score (IELTS-equivalent) for overall and per-band", () => {
    const inputs = profileToMatchInputs(base);
    expect(inputs.userEnglishOverall).toBe(7);
    expect(inputs.userEnglishBand).toBe(7);
  });

  it("applies the provisional baseline when English is booked or not taken (intentional anon difference)", () => {
    expect(profileToMatchInputs({ ...base, englishStatus: "booked", englishScore: undefined }).userEnglishOverall).toBe(6.5);
    expect(profileToMatchInputs({ ...base, englishStatus: "not-taken", englishScore: undefined }).userEnglishOverall).toBe(6.0);
  });

  it("derives the target program level from the current education level", () => {
    expect(profileToMatchInputs({ ...base, educationLevel: "higher-secondary" }).userTargetLevel).toBe("bachelors");
    expect(profileToMatchInputs({ ...base, educationLevel: "bachelors" }).userTargetLevel).toBe("masters");
    expect(profileToMatchInputs({ ...base, educationLevel: "masters" }).userTargetLevel).toBe("masters");
  });

  it("passes the field through (so the soft field rank matches the signed-in path)", () => {
    expect(profileToMatchInputs(base).userField).toBe("computer-science");
    expect(profileToMatchInputs({ ...base, fieldOfStudy: "other" }).userField).toBe("other");
  });

  it("converts the budget to AUD and stamps the Nepal policy level", () => {
    const inputs = profileToMatchInputs(base);
    expect(inputs.userBudgetAud).toBe(45_000); // 4,500,000 NPR / 100
    expect(inputs.policy.nepalAssessmentLevel).toBe(NEPAL_ASSESSMENT_LEVEL);
  });
});
