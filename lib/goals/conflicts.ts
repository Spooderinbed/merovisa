import type { Goal } from "@/lib/scoring/types";

export interface GoalTradeoffNote {
  /** Always "tension" in v1 — synergy pairs are a deferred, sourced follow-up. */
  kind: "tension";
  primary: Goal;
  secondary: Goal;
  text: string;
}

/**
 * Ordered priority list of goal pairs that genuinely pull in different
 * directions. Each pair is unordered {a, b}; a note fires only when the
 * student's PRIMARY goal is one side and the OTHER side is among their
 * secondaries. Higher in the list = surfaced first (only ONE note ever shows).
 *
 * v1 ships only framing-level tensions that assert NO external fact, so they
 * need no `source`/`lastVerified` (same honesty bar as lib/scoring/field-note.ts).
 * Synergy pairs, and any tension that asserts a citable fact (research
 * admissions timelines, Go8 research intensity, regional-study migration
 * pathways), are a deliberately deferred, sourced follow-up.
 */
const TENSIONS: ReadonlyArray<{ a: Goal; b: Goal; text: string }> = [
  {
    a: "permanent-residency",
    b: "highest-ranked",
    text: "Permanent residency and a highest-ranked shortlist can pull in different directions — the university that best fits your migration plan isn't always the highest-ranked one.",
  },
  {
    a: "lowest-cost",
    b: "highest-ranked",
    text: "Lowest total cost and highest-ranked rarely point to the same program — the cheapest option you're eligible for is seldom the top-ranked one.",
  },
];

/**
 * Returns ONE honest note when the student's primary goal and one of their
 * secondary goals tension. Honesty-first and INERT: derived purely from the two
 * goal selections, it never changes a verdict or re-orders matches — it only
 * names a trade-off the student already made. Returns null when the primary is
 * absent, there are no secondaries, or no pair tensions.
 */
export function goalTradeoffNote(
  primary: Goal | null | undefined,
  secondaryGoals: readonly Goal[] | undefined,
): GoalTradeoffNote | null {
  if (!primary) return null;
  if (!secondaryGoals || secondaryGoals.length === 0) return null;
  const secondaries = new Set(secondaryGoals);

  for (const pair of TENSIONS) {
    const other = pair.a === primary ? pair.b : pair.b === primary ? pair.a : null;
    if (other && secondaries.has(other)) {
      return { kind: "tension", primary, secondary: other, text: pair.text };
    }
  }
  return null;
}
