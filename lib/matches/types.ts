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
    /**
     * Budget shortfall against tuition ALONE. Retained despite `costGap` superseding it
     * for the verdict: this key is persisted untyped in the `score_snapshot` Json column
     * (lib/outcomes/repo.ts) on frozen outcome predictions, so removing or renaming it
     * would silently orphan the key on historical rows.
     */
    tuitionGap: number;
    /**
     * Budget shortfall against what the student actually needs — tuition + living +
     * dependents. This is what the verdict is driven from. Collapses to `tuitionGap`
     * when the policy supplies no financial capacity.
     */
    costGap: number;
  };
}

/**
 * The destination's financial-capacity model, supplied by the adapters from the policy
 * layer so `computeOne` never imports a country constant and stays destination-agnostic.
 * Deliberately mirrors the model lib/scoring/financial.ts already applies to the same
 * student: the two engines answer different questions (this program's tuition vs the
 * destination's median), but they must not disagree about what a budget has to cover.
 * Sourced via lib/matches/capacity.ts.
 */
export interface FinancialCapacity {
  /** 12-month living-cost floor for one student, in AUD (DHA Subclass 500 figure for AU). */
  livingAud: number;
  /** Additional capacity required for a declared partner/children, in AUD. Zero when none. */
  dependentsAud: number;
  /**
   * Fraction of the required total a budget must reach to avoid a forced "reach".
   * Shared with the scoring gate (AU_DHA_CAPACITY_GATE.reachRatio) so both engines put
   * the same student in the same band. A ratio is scale-invariant, so it transfers
   * correctly even though the two engines' floors legitimately differ.
   */
  reachRatio: number;
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
  policy: {
    nepalAssessmentLevel: "L2" | "L3";
    /**
     * What the student's budget must actually cover. Required (not optional) so that no
     * call site can silently inherit the pre-MV-120 bug of judging a tuition+living
     * budget against tuition alone — TypeScript forces every seam to decide. `null` is
     * the explicit tuition-only opt-out for a non-AU or unknown destination, and never
     * over-claims: the copy then speaks only of tuition.
     */
    financialCapacity: FinancialCapacity | null;
  };
}
