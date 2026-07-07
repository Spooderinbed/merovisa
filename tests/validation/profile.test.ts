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

  it("rejects englishStatus 'taken' without englishScore", () => {
    const { englishScore: _omit, ...rest } = validProfile;
    void _omit;
    const result = ProfileSchema.safeParse({
      ...rest,
      englishStatus: "taken",
    });
    expect(result.success).toBe(false);
  });

  // B2 — optional dependents (partner boolean, children int 0–10).
  it("accepts a valid dependents object", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      dependents: { partner: true, children: 2 },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dependents).toEqual({ partner: true, children: 2 });
  });

  it("accepts a profile with dependents omitted (applying alone)", () => {
    const result = ProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it("rejects more children than the cap", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      dependents: { partner: true, children: 11 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative or non-integer child count", () => {
    expect(ProfileSchema.safeParse({ ...validProfile, dependents: { partner: false, children: -1 } }).success).toBe(
      false,
    );
    expect(ProfileSchema.safeParse({ ...validProfile, dependents: { partner: false, children: 1.5 } }).success).toBe(
      false,
    );
  });

  it("rejects a non-boolean partner", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      dependents: { partner: "yes", children: 0 },
    });
    expect(result.success).toBe(false);
  });

  // MV-105 Layer A — optional secondaryGoals (up to 2, disjoint from the primary goal).
  it("accepts a valid secondaryGoals list", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      secondaryGoals: ["lowest-cost", "highest-ranked"],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.secondaryGoals).toEqual(["lowest-cost", "highest-ranked"]);
  });

  it("accepts a profile with secondaryGoals omitted", () => {
    const result = ProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it("accepts an empty secondaryGoals array", () => {
    const result = ProfileSchema.safeParse({ ...validProfile, secondaryGoals: [] });
    expect(result.success).toBe(true);
  });

  it("rejects secondaryGoals that contains the primary goal", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      goal: "permanent-residency",
      secondaryGoals: ["permanent-residency"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate secondaryGoals", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      secondaryGoals: ["lowest-cost", "lowest-cost"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than two secondaryGoals", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      secondaryGoals: ["lowest-cost", "highest-ranked", "fastest-admission"],
    });
    expect(result.success).toBe(false);
  });
});
