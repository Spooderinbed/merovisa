import { describe, it, expect } from "vitest";
import { computeMatches } from "@/lib/matches/compute";
import { profileToMatchInputs } from "@/lib/matches/from-student-profile";
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import { TEST_PROGRAMS, TEST_UNIVERSITIES } from "../fixtures/catalog";
import type { StudentProfile } from "@/lib/scoring/types";

/**
 * The core MV-01 acceptance: a first-time anonymous student must get the SAME
 * field/level-eligible match set they'd get after signing in. We prove the whole
 * funnel — anonymous StudentProfile vs. the ProfileSections it persists into
 * (via from-assessment) — yields identical matches over the same catalogue.
 *
 * English is "taken" in every rep because that is where the two paths share
 * identical inputs; the booked/not-taken provisional baseline is an intentional
 * anonymous-only difference (see lib/matches/from-student-profile.ts).
 */
const anon: StudentProfile = {
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

function bothPaths(profile: StudentProfile) {
  const sections = profileSectionsFromAssessment(
    profile as unknown as Record<string, unknown>,
    {},
    { nowYear: 2026 },
  );
  const anonMatches = computeMatches(
    profileToMatchInputs(profile),
    TEST_PROGRAMS,
    TEST_UNIVERSITIES,
  );
  const signedInMatches = computeMatches(
    sectionsToMatchInputs(sections, { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL }),
    TEST_PROGRAMS,
    TEST_UNIVERSITIES,
  );
  return { anonMatches, signedInMatches };
}

describe("anonymous == signed-in match set (equivalent profile)", () => {
  it("matches for a percentage-grade student", () => {
    const { anonMatches, signedInMatches } = bothPaths(anon);
    expect(anonMatches.length).toBeGreaterThan(0);
    expect(anonMatches).toEqual(signedInMatches);
  });

  it("matches for a CGPA student (proves from-assessment normalizes at the boundary)", () => {
    const { anonMatches, signedInMatches } = bothPaths({ ...anon, gradeSystem: "cgpa-4", grade: 3.5 });
    expect(anonMatches).toEqual(signedInMatches);
    // And the CGPA student is no longer forced to all-'reach' (the funnel bug).
    expect(anonMatches.some((m) => m.verdict === "strong" || m.verdict === "possible")).toBe(true);
  });

  it("matches for an off-field student", () => {
    const { anonMatches, signedInMatches } = bothPaths({ ...anon, fieldOfStudy: "nursing" });
    expect(anonMatches).toEqual(signedInMatches);
  });

  it("only surfaces level-eligible programs (a bachelor's holder sees masters, not the bachelor's program)", () => {
    const { anonMatches } = bothPaths(anon);
    expect(anonMatches.every((m) => m.program.level === "masters")).toBe(true);
    expect(anonMatches.some((m) => m.program.id === "uts-bit")).toBe(false);
  });
});
