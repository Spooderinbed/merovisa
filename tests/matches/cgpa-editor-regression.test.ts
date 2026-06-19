import { describe, test, expect } from "vitest";
import { ProfileSectionPatchBodySchema } from "@/lib/validation/profile-section";
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
import { computeMatches } from "@/lib/matches/compute";
import type { ProfileSections } from "@/lib/profiles/sections";
import type { Program, University } from "@/lib/programs/types";

// Regression for the "Fix CGPA entry in profile academic editor" bug: a signed-in
// user who entered CGPA 3.5 on a 4.0 scale had it stored raw, so the matches
// adapter read "3.5" as 3.5% and every program collapsed to "reach" — while the
// verdict path normalized the same value to 87.5%. The save boundary must store a
// true percentage so both paths agree.

const uni: University = {
  id: "u1", country: "AU", name: "Test University", city: "Sydney",
  rankingTier: 1, source: "https://x", lastVerified: "2026-01-01", dataQuality: "primary",
};
const program: Program = {
  id: "p1", universityId: "u1", name: "Master of IT", level: "masters", field: "computer-science",
  tuitionMin: 40000, tuitionMax: 40000, tuitionCurrency: "AUD",
  minGrade: 65, minEnglish: 6.5, minEnglishBand: 6, intakes: ["feb"],
  source: "https://x/p", lastVerified: "2026-01-01", dataQuality: "primary", notes: null,
};

/** Parses the editor's submission through the real save boundary the route uses. */
function savedAcademicFromEditor(patch: Record<string, unknown>) {
  const result = ProfileSectionPatchBodySchema.safeParse({ section: "academic", patch });
  if (!result.success) throw new Error("patch failed validation");
  return result.data.patch as ProfileSections["academic"];
}

describe("CGPA entered in the profile editor yields non-all-reach matches", () => {
  const policy = { nepalAssessmentLevel: "L3" as const };

  function sectionsWith(academic: ProfileSections["academic"]): ProfileSections {
    return {
      academic,
      english: { test: "ielts", overall: 7.0 },
      finance: { total: 100000, currency: "AUD" },
      "intended-study": { field: "computer-science" },
    };
  }

  test("the saved grade reaches the matcher as a percentage (87.5, not 3.5)", () => {
    const academic = savedAcademicFromEditor({ degree: "bachelors", gradePercent: 3.5, gradeSystem: "cgpa-4" });
    const inputs = sectionsToMatchInputs(sectionsWith(academic), policy);
    expect(inputs.userGradePercent).toBe(87.5);
  });

  test("produces at least one non-reach match (no all-reach collapse)", () => {
    const academic = savedAcademicFromEditor({ degree: "bachelors", gradePercent: 3.5, gradeSystem: "cgpa-4" });
    const inputs = sectionsToMatchInputs(sectionsWith(academic), policy);
    const matches = computeMatches(inputs, [program], [uni]);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.verdict === "reach")).toBe(false);
  });

  test("contrast: the raw CGPA (the old bug) WOULD collapse every match to reach", () => {
    // Simulates pre-fix storage: gradePercent persisted raw as 3.5.
    const inputs = sectionsToMatchInputs(sectionsWith({ degree: "bachelors", gradePercent: 3.5 }), policy);
    const matches = computeMatches(inputs, [program], [uni]);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.verdict === "reach")).toBe(true);
  });
});
