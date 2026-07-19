import type { StudentProfile } from "@/lib/scoring/types";

export interface CompletenessSuggestion {
  id: string;
  label: string;
  gain: string;
}

/**
 * Neutral tiers, deliberately NOT "Verified": this meter measures how much of the
 * picture the student has given us, never whether we checked it. The app does not
 * verify uploaded data (nobody reads the PDF; the engine scores the numbers typed),
 * so any "Verified" language would be a false promise (audit C-6).
 */
export type CompletenessLevel = "Started" | "Detailed" | "Full picture";

export interface ProfileCompleteness {
  /** 0-100: weighted share of the picture the student has actually given us. */
  completeness: number;
  level: CompletenessLevel;
  suggestions: CompletenessSuggestion[];
}

/**
 * Optional document-presence signal. The anonymous results surface has no account and
 * cannot upload, so it passes nothing — documents are then neither scored nor suggested
 * there (they would be dead bar items that can never fill). A signed-in caller holding
 * the global checklist state (lib/documents/status-repo.ts) can pass the real flags, so
 * an obtained transcript / funds-evidence honestly RAISES completeness (you gave us
 * more) without ever claiming it raised accuracy or verified anything.
 */
export interface DocumentPresence {
  transcript?: boolean;
  financials?: boolean;
}

/**
 * Honest, weighted PROFILE COMPLETENESS — how much of the picture the student has
 * actually given us. The more complete, the more the verdict is scored on real inputs
 * instead of the unknown-floored / assumed defaults the engine otherwise falls back to
 * (ties to audit C-4, "unknown is not zero"). Replaces the old "accuracy" meter, whose
 * top two tiers were mathematically unreachable and whose document suggestions added
 * zero points (audit C-6).
 *
 * Every signal below is (a) cleanly present-or-absent from the StudentProfile and (b)
 * completable on the surfaces this meter renders on, so satisfying any listed suggestion
 * always raises the bar (no dead items) and a fully-filled profile reaches exactly 100.
 *
 * Denominator = the summed weights of the in-scope signals. The three verdict-driving
 * inputs weigh 3 each — they are what the verdict rests on, and the ones the engine
 * otherwise floors to 0 (grade, budget) or assumes a band for (English). The match/plan-
 * shaping fields weigh 1: field of study and target level (always answered in a real
 * wizard/editor flow, so never a suggestion) and prior visa history.
 *
 * Deliberately EXCLUDED: `dependents`. In StudentProfile, `dependents === undefined`
 * means "applying alone" — a legitimate, complete answer indistinguishable from "not yet
 * declared" — and the anonymous wizard never collects it. Counting it would either strand
 * every solo applicant below 100 (the exact unreachable-tier bug this fixes) or list an
 * "add dependents" item a solo applicant can never satisfy (a dead item). `priorRefusals`,
 * by contrast, is an explicit wizard choice (none/one/multiple) with a clean unset state.
 */
export function computeProfileCompleteness(
  profile: StudentProfile,
  docs?: DocumentPresence,
): ProfileCompleteness {
  const gradeKnown = profile.grade > 0;
  const englishKnown = profile.englishStatus === "taken" && typeof profile.englishScore === "number";
  const budgetKnown = profile.budget > 0;
  const refusalsKnown = profile.priorRefusals != null;

  type Signal = { present: boolean; weight: number; suggestion?: CompletenessSuggestion };
  const signals: Signal[] = [
    {
      present: gradeKnown,
      weight: 3,
      suggestion: { id: "grade", label: "Add your grade", gain: "so your match is scored on your real grade" },
    },
    {
      present: englishKnown,
      weight: 3,
      suggestion: {
        id: "english",
        label: "Add your English score",
        gain: "so your verdict uses your real score, not an assumed band",
      },
    },
    {
      present: budgetKnown,
      weight: 3,
      suggestion: { id: "budget", label: "Add your budget", gain: "so your funding check uses your real budget" },
    },
    // Field of study and target level are required steps — always answered in a real
    // flow, so they carry weight but never surface as a suggestion.
    { present: Boolean(profile.fieldOfStudy), weight: 1 },
    { present: Boolean(profile.educationLevel), weight: 1 },
    {
      present: refusalsKnown,
      weight: 1,
      suggestion: { id: "refusals", label: "Add your visa history", gain: "so your visa risk reflects your real record" },
    },
  ];

  // Documents only enter the picture on a surface that can actually reach them (the
  // signed-in vault/checklist). When `docs` is passed, an obtained document is a present
  // signal and a missing one is a real, satisfiable suggestion; when absent (anonymous
  // results), documents are neither scored nor listed — so they are never dead bar items.
  if (docs) {
    signals.push(
      {
        present: Boolean(docs.transcript),
        weight: 1,
        suggestion: {
          id: "transcript",
          label: "Upload your transcript",
          gain: "keeps your transcript on file for your application",
        },
      },
      {
        present: Boolean(docs.financials),
        weight: 1,
        suggestion: {
          id: "financials",
          label: "Add your financial documents",
          gain: "keeps your funds evidence on file for your application",
        },
      },
    );
  }

  const denominator = signals.reduce((sum, s) => sum + s.weight, 0);
  const filled = signals.reduce((sum, s) => sum + (s.present ? s.weight : 0), 0);
  const completeness = Math.round((filled / denominator) * 100);

  const suggestions = signals
    .filter((s): s is Signal & { suggestion: CompletenessSuggestion } => !s.present && Boolean(s.suggestion))
    .map((s) => s.suggestion);

  const level: CompletenessLevel =
    completeness >= 100 ? "Full picture" : completeness >= 50 ? "Detailed" : "Started";

  return { completeness, level, suggestions };
}
