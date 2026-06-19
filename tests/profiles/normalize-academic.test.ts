import { describe, test, expect } from "vitest";
import { normalizeAcademicPatch } from "@/lib/profiles/normalize-academic";

// gradePercent is canonical: a true 0–100 percentage (the MV-01 invariant). The
// profile editor submits a raw grade in a chosen system (e.g. CGPA 3.5 / cgpa-4);
// this boundary must normalize it and never persist gradeSystem — exactly the
// contract profileSectionsFromAssessment already enforces for the wizard path.
describe("normalizeAcademicPatch", () => {
  test("normalizes a CGPA-4 grade to a true percentage (3.5 → 87.5)", () => {
    expect(normalizeAcademicPatch({ gradePercent: 3.5, gradeSystem: "cgpa-4" })).toStrictEqual({
      gradePercent: 87.5,
      gradeSystem: undefined,
    });
  });

  test("normalizes a CGPA-10 grade (8 → 80)", () => {
    expect(normalizeAcademicPatch({ gradePercent: 8, gradeSystem: "cgpa-10" })).toStrictEqual({
      gradePercent: 80,
      gradeSystem: undefined,
    });
  });

  test("passes a percentage through unchanged when no system is given (85 → 85)", () => {
    expect(normalizeAcademicPatch({ gradePercent: 85 })).toStrictEqual({
      gradePercent: 85,
      gradeSystem: undefined,
    });
  });

  test("treats an explicit percentage system as a pass-through", () => {
    expect(normalizeAcademicPatch({ gradePercent: 72, gradeSystem: "percentage-nepal" })).toStrictEqual({
      gradePercent: 72,
      gradeSystem: undefined,
    });
  });

  test("always clears gradeSystem even when there is no grade to normalize", () => {
    // Guards the merge trap: patchProfileSection spreads { ...stored, ...patch },
    // so a stale gradeSystem on a pre-fix row is only cleared if the patch sets
    // it to undefined (the JSONB write then drops the key).
    expect(normalizeAcademicPatch({ institution: "Tribhuvan University", gradeSystem: "cgpa-4" })).toStrictEqual({
      institution: "Tribhuvan University",
      gradeSystem: undefined,
    });
  });

  test("leaves unrelated fields untouched", () => {
    expect(normalizeAcademicPatch({ degree: "bachelors" })).toStrictEqual({
      degree: "bachelors",
      gradeSystem: undefined,
    });
  });
});
