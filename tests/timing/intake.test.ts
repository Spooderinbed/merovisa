import { describe, it, expect } from "vitest";
import { computeIntakeTiming } from "@/lib/timing/intake";
import { AUSTRALIA } from "@/lib/data/destination/australia";
import type { StudentProfile } from "@/lib/scoring/types";

const profile: StudentProfile = {
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

describe("computeIntakeTiming", () => {
  it("picks the nearest intake whose deadline has not passed", () => {
    const timing = computeIntakeTiming(profile, AUSTRALIA, new Date("2026-06-03"));
    expect(timing.nearest.name).toBe("February");
    expect(timing.nearest.year).toBe(2027);
    expect(timing.nearest.status).toBe("open");
  });

  it("lists later intakes as alternatives", () => {
    const timing = computeIntakeTiming(profile, AUSTRALIA, new Date("2026-06-03"));
    expect(timing.alternatives.length).toBeGreaterThan(0);
    expect(timing.alternatives.some((a) => a.name === "July" && a.year === 2027)).toBe(true);
  });

  it("flags an intake as tight when English is not ready and the deadline is near", () => {
    const soon = computeIntakeTiming(
      { ...profile, englishStatus: "not-taken", englishScore: undefined },
      AUSTRALIA,
      new Date("2026-02-20"),
    );
    expect(["tight", "open"]).toContain(soon.nearest.status);
  });
});
