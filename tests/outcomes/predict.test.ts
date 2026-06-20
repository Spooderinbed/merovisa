import { describe, it, expect } from "vitest";
import { buildPrediction } from "@/lib/outcomes/predict";
import { RULE_VERSION } from "@/lib/scoring/engine";
import type { StudentProfile } from "@/lib/scoring/types";
import type { Program, University } from "@/lib/programs/types";

// Student who comfortably clears the base program (grade 72%, IELTS 7,
// 4.5M NPR ≈ 50k AUD, masters target). Mirrors tests/matches fixtures.
const profile: StudentProfile = {
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
    const pred = buildPrediction(profile, program(), uni);
    expect(pred.verdict).toBe("strong");
    expect(pred.scoreSnapshot).toEqual({ gradeGap: 0, englishGap: 0, bandGap: 0, tuitionGap: 0 });
    expect(pred.ruleVersion).toBe(RULE_VERSION);
  });

  it("recomputes a reach verdict and records the gap (a grade-short program)", () => {
    const pred = buildPrediction(profile, program({ minGrade: 90 }), uni);
    expect(pred.verdict).toBe("reach");
    expect(pred.scoreSnapshot.gradeGap).toBe(18); // 90 - 72
  });

  it("freezes a program the student is not targeting — no browse eligibility filter applied", () => {
    // level 'bachelors' vs the student's target 'masters': the matches LIST hides
    // this, but a student can still apply to it, so the prediction must compute.
    const pred = buildPrediction(profile, program({ level: "bachelors" }), uni);
    expect(["strong", "possible", "reach"]).toContain(pred.verdict);
  });
});
