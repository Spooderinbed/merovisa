import type { Program, University } from "@/lib/programs/types";
import type { MatchResult } from "@/lib/matches/types";

/**
 * A compact, deterministic programs+universities catalogue for match-engine tests.
 * Mirrors the shape of the live DB (lib/programs/repo.ts) without a DB round-trip:
 * two universities, masters CS at both (for ranking + tuition-sort), one engineering,
 * one nursing (off-field), and one bachelors (to exercise the level filter).
 */
export const TEST_UNIVERSITIES: University[] = [
  {
    id: "u-melb",
    country: "AU",
    name: "Test Melbourne",
    city: "Melbourne",
    rankingTier: 1,
    source: "https://melb.test/programs",
    lastVerified: "2026-06-04",
    dataQuality: "primary",
  },
  {
    id: "u-uts",
    country: "AU",
    name: "Test UTS",
    city: "Sydney",
    rankingTier: 2,
    source: "https://uts.test/programs",
    lastVerified: "2026-06-04",
    dataQuality: "primary",
  },
];

function program(p: Partial<Program> & Pick<Program, "id" | "universityId" | "name" | "level" | "field">): Program {
  return {
    tuitionMin: 50000,
    tuitionMax: 55000,
    tuitionCurrency: "AUD",
    minGrade: 65,
    minEnglish: 6.5,
    minEnglishBand: 6,
    intakes: ["feb", "jul"],
    source: `https://${p.universityId}.test/${p.id}`,
    lastVerified: "2026-06-04",
    dataQuality: "derived",
    notes: null,
    ...p,
  };
}

export const TEST_PROGRAMS: Program[] = [
  program({ id: "melb-mit", universityId: "u-melb", name: "Master of IT", level: "masters", field: "computer-science", tuitionMin: 50000, tuitionMax: 55000 }),
  program({ id: "melb-meng", universityId: "u-melb", name: "Master of Engineering", level: "masters", field: "engineering", tuitionMin: 51000, tuitionMax: 56000 }),
  program({ id: "uts-mit", universityId: "u-uts", name: "Master of IT", level: "masters", field: "computer-science", tuitionMin: 41000, tuitionMax: 46000, minGrade: 60 }),
  program({ id: "uts-bit", universityId: "u-uts", name: "Bachelor of IT", level: "bachelors", field: "computer-science", tuitionMin: 42000, tuitionMax: 47000, minGrade: 70 }),
  program({ id: "uts-mnurs", universityId: "u-uts", name: "Master of Nursing", level: "masters", field: "nursing", tuitionMin: 45000, tuitionMax: 50000, minEnglish: 7, minEnglishBand: 7, intakes: ["feb"], notes: "AHPRA registration required" }),
];

/** Build a MatchResult for component tests (defaults to a clean "strong" CS program). */
export function makeMatchResult(overrides: Partial<MatchResult> = {}): MatchResult {
  const program = TEST_PROGRAMS[0]!;
  const university = TEST_UNIVERSITIES[0]!;
  return {
    program,
    university,
    verdict: "possible",
    reasons: [{ kind: "academic", text: "A realistic target.", positive: true }],
    scoreSnapshot: { gradeGap: 0, englishGap: 0, bandGap: 0, tuitionGap: 0 },
    ...overrides,
  };
}
