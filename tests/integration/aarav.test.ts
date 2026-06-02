import { describe, it, expect } from "vitest";
import { runAssessment } from "@/lib/scoring/engine";
import { ProfileSchema } from "@/lib/validation/profile";
import type { StudentProfile } from "@/lib/scoring/types";

describe("Aarav persona", () => {
  const aarav: StudentProfile = {
    homeCountry: "Nepal",
    educationLevel: "bachelors",
    gradeSystem: "percentage-nepal",
    grade: 72,
    fieldOfStudy: "computer-science",
    graduationYear: new Date().getFullYear() - 1,
    gapReasons: ["worked"],
    englishStatus: "taken",
    englishScore: 7.0,
    destination: "australia",
    budget: 4500000,
    budgetCurrency: "NPR",
    fundingSource: "education-loan",
    goal: "permanent-residency",
  };

  it("validates the persona profile", () => {
    expect(ProfileSchema.safeParse(aarav).success).toBe(true);
  });

  it("produces a 'possible' verdict (CS at UniMelb is a stretch but realistic)", () => {
    const result = runAssessment(aarav);
    expect(result.verdict).toBe("possible");
  });

  it("returns factors that mention the work-explained gap", () => {
    const result = runAssessment(aarav);
    const allFactors = [
      ...result.dimensions.academic.factors,
      ...result.dimensions.financial.factors,
      ...result.dimensions.visa.factors,
      ...result.dimensions.profileStrength.factors,
    ];
    expect(allFactors.some((f) => /work/i.test(f.label) || /work/i.test(f.detail))).toBe(true);
  });

  it("reports a rule version and ISO timestamp", () => {
    const result = runAssessment(aarav);
    expect(result.ruleVersion).toBe("v0.1.0");
    expect(Date.parse(result.computedAt)).not.toBeNaN();
  });
});
