import type { Program, University } from "@/lib/programs/types";

export type MatchVerdict = "strong" | "possible" | "reach";

export interface MatchReason {
  kind: "academic" | "english" | "english-band" | "tuition" | "policy" | "field";
  text: string;
  positive: boolean;
}

export interface MatchResult {
  program: Program;
  university: University;
  verdict: MatchVerdict;
  reasons: MatchReason[];
  scoreSnapshot: {
    gradeGap: number;
    englishGap: number;
    bandGap: number;
    tuitionGap: number;
  };
}

export interface MatchInputs {
  /** Nepal TU percentage (derived) — from profile.academic.gradePercent or assessment snapshot */
  userGradePercent: number | null;
  /** IELTS overall — from profile.english.overall */
  userEnglishOverall: number | null;
  /** IELTS per-band minimum — defaulted to overall when unknown */
  userEnglishBand: number | null;
  /** User budget converted to AUD per year */
  userBudgetAud: number | null;
  /** Intended study field — from profile.intended-study.field */
  userField: string | null;
  /** Policy flags */
  policy: { nepalAssessmentLevel: "L2" | "L3" };
}
