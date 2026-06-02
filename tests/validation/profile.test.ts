import { describe, it, expect } from "vitest";
import { ProfileSchema } from "@/lib/validation/profile";

describe("ProfileSchema", () => {
  const validProfile = {
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

  it("accepts a valid profile", () => {
    const result = ProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it("rejects an out-of-range grade", () => {
    const result = ProfileSchema.safeParse({ ...validProfile, grade: 150 });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid education level", () => {
    const result = ProfileSchema.safeParse({ ...validProfile, educationLevel: "phd" });
    expect(result.success).toBe(false);
  });

  it("requires gapReasons when there is a gap", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      graduationYear: 2020,
      gapReasons: [],
    });
    expect(result.success).toBe(false);
  });

  it("allows empty gapReasons when there is no gap", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      graduationYear: 2026,
      gapReasons: [],
    });
    expect(result.success).toBe(true);
  });

  it("allows englishScore to be omitted when status is not 'taken'", () => {
    const { englishScore: _omit, ...rest } = validProfile;
    void _omit;
    const result = ProfileSchema.safeParse({
      ...rest,
      englishStatus: "not-taken",
    });
    expect(result.success).toBe(true);
  });
});
