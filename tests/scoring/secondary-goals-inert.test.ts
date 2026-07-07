import { describe, it, expect } from "vitest";
import { runAssessment } from "@/lib/scoring/engine";
import type { StudentProfile } from "@/lib/scoring/types";

/**
 * THE HONESTY GUARANTEE (MV-105 Layer A).
 *
 * The trust finding for this slice: no secondary goal drives the verdict or any
 * dimension score. runAssessment reads only the primary academic/financial/visa/
 * profile-strength signals — never `goal`, and never `secondaryGoals`. This test
 * exercises the REAL engine (not a stub) and asserts the result is byte-identical
 * whether secondaryGoals is absent, empty, or fully populated. If a future change
 * ever lets a secondary goal move a score, this fails loudly.
 */
const base: StudentProfile = {
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

// Strip the non-deterministic timestamp so we compare only the scored payload.
function scored(profile: StudentProfile) {
  const { computedAt: _omit, ...rest } = runAssessment(profile);
  void _omit;
  return rest;
}

describe("secondary goals never move the verdict (honesty guarantee)", () => {
  it("produces a byte-identical result with vs. without secondaryGoals", () => {
    const withoutSecondaries = scored(base);
    const withSecondaries = scored({
      ...base,
      secondaryGoals: ["lowest-cost", "highest-ranked"],
    });
    expect(withSecondaries).toEqual(withoutSecondaries);
  });

  it("keeps the verdict band, weighted score, and every dimension identical", () => {
    const a = scored(base);
    const b = scored({ ...base, secondaryGoals: ["research"] });
    expect(b.verdict).toBe(a.verdict);
    expect(b.weighted).toBe(a.weighted);
    expect(b.dimensions).toEqual(a.dimensions);
  });

  it("an empty secondaryGoals array is inert too", () => {
    expect(scored({ ...base, secondaryGoals: [] })).toEqual(scored(base));
  });
});
