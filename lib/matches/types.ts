import type { Program, University, ProgramLevel } from "@/lib/programs/types";

export type MatchVerdict = "strong" | "possible" | "reach";

export interface MatchReason {
  kind: "academic" | "english" | "english-band" | "tuition" | "policy" | "field";
  text: string;
  positive: boolean;
}

export type PreferenceChip = { text: string };

export interface MatchResult {
  program: Program;
  university: University;
  verdict: MatchVerdict;
  reasons: MatchReason[];
  /** Set by the preference pass (lib/matches/preference.ts); absent on the eligibility-only path. */
  preferenceChip?: PreferenceChip | null;
  scoreSnapshot: {
    gradeGap: number;
    englishGap: number;
    bandGap: number;
    tuitionGap: number;
  };
}

/** A short note explaining how the chosen goal shaped (or could not shape) the order. */
export type PreferenceNote =
  | { kind: "ranked"; text: string }
  | { kind: "deferred"; text: string }
  | {
      kind: "pr-context";
      before: string;
      linkText: string;
      after: string;
      source: { href: string; lastVerified?: string };
    };

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
  /**
   * Target program level the user is eligible to apply for — from
   * profile.intended-study.level, else mapped from current academic.degree
   * (higher-secondary → bachelors, bachelors/masters → masters). Null when no
   * academic data is available, in which case the level filter is skipped.
   */
  userTargetLevel: ProgramLevel | null;
  /** Policy flags */
  policy: { nepalAssessmentLevel: "L2" | "L3" };
}
