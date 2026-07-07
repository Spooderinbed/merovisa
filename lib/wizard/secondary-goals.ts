import type { Goal } from "@/lib/scoring/types";

/** Max number of secondary goals a student may add beyond their primary `goal`. */
export const SECONDARY_GOALS_CAP = 2;

/**
 * Normalises a secondary-goals list against the primary goal, enforcing the
 * invariant the rest of the app relies on: the primary is never in its own
 * secondary set, duplicates are removed, and the list is capped. Order is
 * preserved (first occurrence wins). Used to keep the two selections disjoint
 * whenever either the primary or the secondaries change.
 *
 * Layer A is lightly INERT: these captured goals are echoed in the recap but do
 * NOT re-rank matches or move the verdict (see secondary-goals-inert.test.ts).
 */
export function reconcileSecondaryGoals(
  primary: Goal,
  secondaries: readonly Goal[],
): Goal[] {
  const out: Goal[] = [];
  for (const g of secondaries) {
    if (g === primary) continue;
    if (out.includes(g)) continue;
    out.push(g);
    if (out.length === SECONDARY_GOALS_CAP) break;
  }
  return out;
}

/**
 * Toggles one goal in/out of the secondary set, respecting the cap and never
 * letting the primary in. Adding past the cap or adding the primary is a no-op;
 * removal always works, even at the cap. Keeps the wizard step dumb — the rule
 * lives here where it can be unit-tested.
 */
export function toggleSecondaryGoal(
  current: readonly Goal[],
  goal: Goal,
  primary: Goal,
): Goal[] {
  if (goal === primary) return [...current];
  if (current.includes(goal)) return current.filter((g) => g !== goal);
  if (current.length >= SECONDARY_GOALS_CAP) return [...current];
  return [...current, goal];
}
