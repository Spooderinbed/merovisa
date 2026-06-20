import { describe, it, expect } from "vitest";
import { buildPrediction } from "@/lib/outcomes/predict";
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import { RULE_VERSION } from "@/lib/scoring/engine";
import type { MatchInputs } from "@/lib/matches/types";
import type { Program, University } from "@/lib/programs/types";
import type { ProfileSections } from "@/lib/profiles/sections";

// Inputs for a student who comfortably clears the base program (grade 72%,
// IELTS 7, ~50k AUD budget, masters target). Mirrors tests/matches fixtures.
const strongInputs: MatchInputs = {
  userGradePercent: 72,
  userEnglishOverall: 7,
  userEnglishBand: 7,
  userBudgetAud: 50000,
  userField: "computer-science",
  userTargetLevel: "masters",
  policy: { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL },
};

const uni: University = {
  id: "u1",
  country: "AU",
  name: "X",
  city: "Y",
  rankingTier: 2,
  source: "https://x",
  lastVerified: "2026-01-01",
  dataQuality: "primary",
};

const program = (over: Partial<Program> = {}): Program => ({
  id: "p1",
  universityId: "u1",
  name: "Master of IT",
  level: "masters",
  field: "computer-science",
  tuitionMin: 40000,
  tuitionMax: 40000,
  tuitionCurrency: "AUD",
  minGrade: 65,
  minEnglish: 6.5,
  minEnglishBand: 6.0,
  intakes: ["feb"],
  source: "https://x",
  lastVerified: "2026-01-01",
  dataQuality: "primary",
  notes: null,
  ...over,
});

describe("buildPrediction (F16: verdict recomputed server-side to freeze)", () => {
  it("freezes the per-program verdict + gap snapshot + rule version for a strong fit", () => {
    const pred = buildPrediction(strongInputs, program(), uni);
    expect(pred.verdict).toBe("strong");
    expect(pred.scoreSnapshot).toEqual({ gradeGap: 0, englishGap: 0, bandGap: 0, tuitionGap: 0 });
    expect(pred.ruleVersion).toBe(RULE_VERSION);
  });

  it("recomputes a reach verdict and records the gap (a grade-short program)", () => {
    const pred = buildPrediction(strongInputs, program({ minGrade: 90 }), uni);
    expect(pred.verdict).toBe("reach");
    expect(pred.scoreSnapshot.gradeGap).toBe(18); // 90 - 72
  });

  it("freezes a program the student is not targeting — no browse eligibility filter applied", () => {
    // level 'bachelors' vs the student's target 'masters': the matches LIST hides
    // this, but a student can still apply to it, so the prediction must compute.
    const pred = buildPrediction(strongInputs, program({ level: "bachelors" }), uni);
    expect(["strong", "possible", "reach"]).toContain(pred.verdict);
  });

  it("throws when the university is missing (cannot freeze a verdict)", () => {
    expect(() => buildPrediction(strongInputs, program(), undefined as unknown as University)).toThrow();
  });

  // F16 regression: the freeze must equal what the SIGNED-IN matches page showed.
  // The page computes via sectionsToMatchInputs, which treats a missing English
  // score as null (→ the gap is measured against 0 → reach). Freezing through the
  // anonymous StudentProfile adapter (effectiveEnglish booked→6.5/not-taken→6.0)
  // would instead store an optimistic "possible" — a DIFFERENT verdict than shown.
  it("freezes the signed-in verdict (no English score → reach), not the anonymous baseline", () => {
    const sections: ProfileSections = {
      academic: { degree: "bachelors", gradeSystem: "percentage-nepal", gradePercent: 72 },
      "intended-study": { field: "computer-science", level: "masters" },
      finance: { total: 4_500_000, currency: "NPR" },
      // no `english` section → sectionsToMatchInputs yields userEnglishOverall = null
    };
    const inputs = sectionsToMatchInputs(sections, { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });
    const pred = buildPrediction(inputs, program(), uni);
    expect(pred.verdict).toBe("reach");
    expect(pred.scoreSnapshot.englishGap).toBeGreaterThan(1);
  });
});
