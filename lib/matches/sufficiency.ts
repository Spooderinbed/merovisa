import type { MatchInputs } from "./types";

/**
 * Whether a profile carries enough to score a verdict honestly. `computeOne`
 * (lib/matches/compute.ts) floors every unknown verdict input to 0
 * (`userGradePercent ?? 0`, `userEnglishOverall ?? 0`, `userBudgetAud ?? 0`), so a
 * name-only student — grade, English, and budget all absent — would be handed a
 * fabricated "Reach · Grade short by 65%" band they never earned. This is the
 * upstream gate the consumer sites check before calling the matcher, so an absent
 * profile renders the profile-incomplete prompt instead of an invented shortfall
 * (audit C-4, "Unknown is not zero").
 *
 * Returns false ONLY when all three verdict-driving inputs are absent. ANY one
 * present ⇒ sufficient: a partial profile must still surface match cards, because a
 * wall is itself a bounce to a consultancy. English presence keys on
 * `userEnglishOverall` (the per-band value proxies to the overall in the adapter).
 * Non-verdict inputs (field, target level) never lift the gate — they cannot be
 * scored into a band.
 */
export function hasSufficientInputs(inputs: MatchInputs): boolean {
  return (
    inputs.userGradePercent != null ||
    inputs.userEnglishOverall != null ||
    inputs.userBudgetAud != null
  );
}
