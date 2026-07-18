import type { MatchInputs } from "./types";

/**
 * Whether a profile carries ANY real verdict input, so the matcher is not scoring a
 * profile that is entirely zeros. `computeOne` (lib/matches/compute.ts) floors every
 * unknown verdict input to 0 (`userGradePercent ?? 0`, `userEnglishOverall ?? 0`,
 * `userBudgetAud ?? 0`), so a name-only student — grade, English, and budget all absent —
 * would be handed a fabricated "Reach · Grade short by 65%" band they never earned. This
 * is the upstream gate the consumer sites check before calling the matcher, so a
 * carries-nothing profile abstains (renders the "add your details" prompt / a 422) instead
 * of an invented shortfall (audit C-4, "Unknown is not zero").
 *
 * This is Layer A — the all-zeros guard — ONLY. It does not make a partial profile fully
 * honest: with one input present the matcher still floors the OTHER unknowns to 0 and can
 * print a shortfall off them (a grade-only profile still prints "IELTS overall short by
 * 6.0"). A real `unknown` verdict band that fixes that is deferred Layer B
 * (compute.ts:73-99).
 *
 * Returns false ONLY when all three verdict-driving inputs are absent. ANY one present ⇒
 * pass: a partial profile must still surface match cards, because a wall is itself a bounce
 * to a consultancy. English presence keys on `userEnglishOverall`, NOT `userEnglishBand`:
 * the matcher derives the English verdict from the (0-floored) overall, so a bands-only
 * profile — which the adapter CAN yield (all four IELTS bands, no overall) — would still
 * fabricate an "overall short by X" reason; abstaining on it is the honest Layer-A choice,
 * and deriving a verdict from bands alone is Layer B. Non-verdict inputs (field, target
 * level) never lift the gate — they cannot be scored into a band.
 */
export function hasSufficientInputs(inputs: MatchInputs): boolean {
  return (
    inputs.userGradePercent != null ||
    inputs.userEnglishOverall != null ||
    inputs.userBudgetAud != null
  );
}
