import type { Program, University, ProgramLevel } from "@/lib/programs/types";
import type { NepalEvidenceLevel } from "@/lib/data/source/au-nepal-evidence-levels";

export type MatchVerdict = "strong" | "possible" | "reach";

export interface MatchReason {
  kind: "academic" | "english" | "english-band" | "tuition" | "policy" | "field" | "field-exploring";
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
  /**
   * DHA Nepal-passport evidence level for this provider (study-type 01), attached
   * server-side by lib/matches/evidence.ts so the client never bundles the harvested
   * directory/evidence datasets. `source` is the WET tool URL, carried on the object
   * so the client imports nothing heavy. Absent when the university doesn't resolve.
   */
  evidence?: { level: NepalEvidenceLevel; source: string } | null;
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
  /** Intended study field (the PRIMARY, verdict-owning field) — from profile.intended-study.field */
  userField: string | null;
  /**
   * Extra "also considering" fields (never the primary). A SOFT signal only:
   * programs in these fields sort below the primary-field programs but above the
   * rest, and carry an explicitly exploratory reason so a student never reads the
   * primary verdict onto them. Omitted ⇒ none.
   */
  alsoFields?: string[];
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
