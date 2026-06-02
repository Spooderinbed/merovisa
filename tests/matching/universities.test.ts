import { describe, it, expect } from "vitest";
import { matchUniversities, gradeToPercent, effectiveEnglish } from "@/lib/matching/universities";
import type { StudentProfile } from "@/lib/scoring/types";

const base: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 85,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear(),
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("gradeToPercent", () => {
  it("passes through percentage systems and converts CGPA scales", () => {
    expect(gradeToPercent(85, "percentage-nepal")).toBe(85);
    expect(gradeToPercent(3.2, "cgpa-4")).toBeCloseTo(80);
    expect(gradeToPercent(8, "cgpa-10")).toBeCloseTo(80);
  });
});

describe("effectiveEnglish", () => {
  it("uses the score when taken, otherwise conservative assumptions", () => {
    expect(effectiveEnglish({ englishStatus: "taken", englishScore: 6.5 })).toBe(6.5);
    expect(effectiveEnglish({ englishStatus: "booked" })).toBe(6.5);
    expect(effectiveEnglish({ englishStatus: "not-taken" })).toBe(6.0);
  });
});

describe("matchUniversities", () => {
  it("only returns universities that offer the chosen field", () => {
    const matches = matchUniversities(base);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.university.fieldsOffered.includes("computer-science"))).toBe(true);
  });

  it("returns every university when the field is 'other'", () => {
    const matches = matchUniversities({ ...base, fieldOfStudy: "other" });
    expect(matches.length).toBe(10);
  });

  it("sorts strong matches before reaches", () => {
    const matches = matchUniversities(base);
    const levels = matches.map((m) => m.matchLevel);
    const firstReach = levels.indexOf("reach");
    const lastStrong = levels.lastIndexOf("strong");
    if (firstReach !== -1 && lastStrong !== -1) expect(lastStrong).toBeLessThan(firstReach);
  });

  it("rates a low grade as a reach at a top-tier school", () => {
    const matches = matchUniversities({ ...base, grade: 60 });
    const unimelb = matches.find((m) => m.university.id === "unimelb");
    expect(unimelb?.matchLevel).toBe("reach");
  });
});
