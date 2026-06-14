import type { Goal } from "@/lib/scoring/types";
import type { MatchResult, PreferenceNote, PreferenceChip } from "@/lib/matches/types";
import type { UniversityMatch } from "@/lib/matching/universities";
import { AU_TEMPORARY_GRADUATE_VISA } from "@/lib/data/source/au-temporary-graduate-visa";

export interface PreferenceSignals {
  rankingTier: number;
  tuition: number | null;
  /** Soonest upcoming intake: epoch ms for sorting + a pre-formatted "Mon YYYY" label. */
  nearestIntake: { at: number; label: string } | null;
}

export interface PreferenceAdapter<T> {
  band: (item: T) => "strong" | "possible" | "reach";
  signals: (item: T, now: Date) => PreferenceSignals;
  withChip: (item: T, chip: PreferenceChip | null) => T;
}

export interface PreferenceOutcome<T> {
  items: T[];
  note: PreferenceNote | null;
}

const BAND_RANK = { strong: 0, possible: 1, reach: 2 } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_TOKENS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const RANKED_LABEL: Record<"highest-ranked" | "lowest-cost" | "fastest-admission", string> = {
  "highest-ranked": "highest-ranked university",
  "lowest-cost": "lowest total cost",
  "fastest-admission": "fastest admission",
};

/** Soonest intake in a strictly-future month across the tokens; null if none parse. Month-granular, so it is independent of `now`'s time of day. */
export function parseNearestIntake(tokens: string[], now: Date): { at: number; label: string } | null {
  const nowMonths = now.getFullYear() * 12 + now.getMonth();
  let best: { at: number; label: string } | null = null;
  for (const token of tokens) {
    const mi = MONTH_TOKENS[token.slice(0, 3).toLowerCase()];
    if (mi === undefined) continue;
    // Roll to next year when this year's month is the current month or earlier.
    let year = now.getFullYear();
    if (year * 12 + mi <= nowMonths) year += 1;
    const at = new Date(year, mi, 1).getTime();
    if (best === null || at < best.at) best = { at, label: `${MONTHS[mi]} ${year}` };
  }
  return best;
}

function sortKey(goal: Goal, s: PreferenceSignals): number {
  switch (goal) {
    case "highest-ranked": return s.rankingTier;
    case "lowest-cost": return s.tuition ?? Number.POSITIVE_INFINITY;
    case "fastest-admission": return s.nearestIntake?.at ?? Number.POSITIVE_INFINITY;
    default: return 0;
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function withinSixMonths(at: number, now: Date): boolean {
  const d = new Date(at);
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return months >= 0 && months <= 6;
}

function chipFor(goal: Goal, s: PreferenceSignals, bandMedian: number | null, now: Date): PreferenceChip | null {
  if (goal === "highest-ranked") return s.rankingTier === 1 ? { text: "Tier-1 ranked" } : null;
  if (goal === "lowest-cost") {
    return s.tuition !== null && bandMedian !== null && s.tuition < bandMedian ? { text: "Lower tuition" } : null;
  }
  if (goal === "fastest-admission") {
    return s.nearestIntake && withinSixMonths(s.nearestIntake.at, now)
      ? { text: `Next intake — ${s.nearestIntake.label}` }
      : null;
  }
  return null;
}

function buildNote(goal: Goal, rankable: boolean): PreferenceNote {
  if (goal === "permanent-residency") {
    const visa = AU_TEMPORARY_GRADUATE_VISA[0]!;
    return {
      kind: "pr-context",
      before: "You chose permanent residency. Australia has post-study pathways such as the ",
      linkText: "Subclass 485 Temporary Graduate visa",
      after: " after eligible study. We don't rank individual programs by PR outcome, so these matches stay ordered by eligibility.",
      source: { href: visa.source, lastVerified: visa.lastVerified },
    };
  }
  if (goal === "best-employment") {
    return { kind: "deferred", text: "We don't yet have program-level employment data, so these matches stay ordered by eligibility." };
  }
  if (goal === "research") {
    return { kind: "deferred", text: "We don't yet have program-level research data, so these matches stay ordered by eligibility." };
  }
  if (goal === "fastest-admission" && !rankable) {
    return {
      kind: "deferred",
      text: "Intake timing is shared across these university-level results, so these matches stay ordered by eligibility. Program-level intake sorting appears after sign-in.",
    };
  }
  if (goal === "highest-ranked" || goal === "lowest-cost" || goal === "fastest-admission") {
    return { kind: "ranked", text: `Ordered by your priority: ${RANKED_LABEL[goal]}.` };
  }
  // Exhaustive: every Goal is handled above. A future unmapped goal lands here
  // (an honest eligibility note) instead of rendering "...: undefined.".
  return { kind: "deferred", text: "These matches are ordered by eligibility." };
}

export function applyPreference<T>(
  items: T[],
  goal: Goal | null,
  adapter: PreferenceAdapter<T>,
  now: Date = new Date(),
): PreferenceOutcome<T> {
  if (!goal) return { items, note: null };

  const enriched = items.map((item) => ({ item, band: adapter.band(item), signals: adapter.signals(item, now) }));

  const rankable =
    goal === "highest-ranked" || goal === "lowest-cost"
      ? true
      : goal === "fastest-admission"
        ? enriched.some((e) => e.signals.nearestIntake !== null)
        : false;

  const ordered = rankable
    ? [...enriched].sort(
        (a, b) => BAND_RANK[a.band] - BAND_RANK[b.band] || sortKey(goal, a.signals) - sortKey(goal, b.signals),
      )
    : enriched;

  const bandMedian = new Map<string, number | null>();
  if (goal === "lowest-cost") {
    for (const band of ["strong", "possible", "reach"] as const) {
      const tuitions = ordered
        .filter((e) => e.band === band)
        .map((e) => e.signals.tuition)
        .filter((t): t is number => t !== null);
      bandMedian.set(band, median(tuitions));
    }
  }

  const decorated = ordered.map((e) =>
    adapter.withChip(e.item, rankable ? chipFor(goal, e.signals, bandMedian.get(e.band) ?? null, now) : null),
  );

  return { items: decorated, note: buildNote(goal, rankable) };
}

/** Binds the engine to the signed-in program-level result shape. */
export const signedInPreferenceAdapter: PreferenceAdapter<MatchResult> = {
  band: (m) => m.verdict,
  signals: (m, now) => ({
    rankingTier: m.university.rankingTier,
    tuition: m.program.tuitionMin,
    nearestIntake: parseNearestIntake(m.program.intakes, now),
  }),
  withChip: (m, chip) => ({ ...m, preferenceChip: chip }),
};

/** Binds the engine to the anonymous university-level result shape (no per-university intake). */
export const anonymousPreferenceAdapter: PreferenceAdapter<UniversityMatch> = {
  band: (m) => m.matchLevel,
  signals: (m) => ({
    rankingTier: m.university.rankingTier,
    tuition: m.university.tuitionUsdPerYear.min,
    nearestIntake: null,
  }),
  withChip: (m, chip) => ({ ...m, preferenceChip: chip }),
};
