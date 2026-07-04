import { describe, it, expect } from "vitest";
import { recapLines } from "@/components/assess/profile-recap";
import type { StudentProfile } from "@/lib/scoring/types";

const aarav: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear() - 2,
  gapReasons: ["worked"],
  englishStatus: "taken",
  englishScore: 7,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("recapLines", () => {
  it("summarizes the profile into human-readable lines", () => {
    const lines = recapLines(aarav);
    expect(lines[0]).toContain("Nepal");
    expect(lines[0]).toContain("Computer Science");
    expect(lines.join("\n")).toContain("IELTS 7.0");
    expect(lines.join("\n")).toMatch(/2 years gap/);
    expect(lines.join("\n")).toContain("Australia");
    expect(lines.join("\n")).toContain("Permanent residency");
  });

  it("omits the gap line when there is no gap", () => {
    const fresh = { ...aarav, graduationYear: new Date().getFullYear(), gapReasons: [] as StudentProfile["gapReasons"] };
    expect(recapLines(fresh).some((l) => /gap/.test(l))).toBe(false);
  });

  it("shows an also-considering line only when extra fields are present", () => {
    expect(recapLines(aarav).some((l) => /also considering/i.test(l))).toBe(false);
    const withExtras = recapLines({ ...aarav, alsoConsidering: ["business", "data-science"] });
    const line = withExtras.find((l) => /also considering/i.test(l));
    expect(line).toBeDefined();
    expect(line).toContain("Business");
    expect(line).toContain("Data Science");
  });
});
