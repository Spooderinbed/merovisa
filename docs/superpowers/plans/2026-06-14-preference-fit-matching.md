# Preference-fit Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the university/program lists actually respond to the student's chosen goal (highest-ranked / lowest-cost / fastest-admission) on both the anonymous wizard results and the signed-in `/matches` page — ordering within each eligibility band, tagging cards with a "why this fits" chip, and showing an honest note for goals we can't rank.

**Architecture:** A single generic helper `applyPreference<T>(items, goal, adapter, now)` in `lib/matches/preference.ts` owns every preference decision — sort keys, chip thresholds, note copy, rankability. Two thin concrete adapters bind it to the two result shapes (`MatchResult`, `UniversityMatch`). Eligibility (`computeMatches`, `matchUniversities`) is untouched; preference is a separate decorate-and-sort pass. All preference logic is server-side; chips/notes ride to the client as plain data.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-14-preference-fit-matching-design.md`

**Lane guardrails:** No scoring-engine / golden / `ruleVersion` / `configVersion` change. No new profile field, no DB migration. Preserve the dirty WIP trio (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`) — stage only the files each task names. Multi-line commit messages via temp file + `git commit -F`; the single-line messages below are apostrophe-free and safe with `-m`.

**Deviation from spec (intentional):** The spec listed `MatchInputs.goal` + a `from-sections` read. `computeMatches` never consumes `goal`, so instead each call site reads `goal` directly (`sections.career?.goal` signed-in; `profile.goal` anonymous) and passes it to `applyPreference`. This keeps `MatchInputs`/`from-sections` and their tests untouched and is symmetric across both surfaces. Behaviour is identical.

Two further minor refinements: (1) `PreferenceSignals.nearestIntake` carries a `{ at, label }` object (not the bare epoch the spec sketched) so the chip label is computed server-side where the `Date` is built — no behaviour change. (2) `lib/plan/invalidate.ts` is a third `computeMatches` consumer that is **intentionally left untouched** — `generatePlan` only counts/filters matches by `verdict`, so preference ordering and the optional `preferenceChip` are inert there; do not wire preference into the plan path.

---

## File Structure

**New files**

- `lib/matches/preference.ts` — generic engine (`applyPreference`), `parseNearestIntake`, the two adapters (`signedInPreferenceAdapter`, `anonymousPreferenceAdapter`), and all copy/thresholds. Server-only.
- `components/matches/preference-note.tsx` — presentational note; renders the 485 `SourceAnchor` for the PR variant. Shared by both surfaces.
- `tests/matches/preference.test.ts` — engine behaviour, chips, notes, `parseNearestIntake`.
- `tests/components/matches/preference-note.test.tsx` — note rendering (ranked / deferred / pr-context).
- `tests/components/wizard/goal-step.test.tsx` — wizard subtext copy-lock.

**Modified files**

- `lib/matches/types.ts` — `MatchResult.preferenceChip?`; new `PreferenceNote` type (client-safe).
- `lib/matching/universities.ts` — `UniversityMatch.preferenceChip?`.
- `lib/results/types.ts` — `AssessmentPayload.preferenceNote?`.
- `lib/results/assemble.ts` — anonymous preference pass.
- `app/(app)/matches/page.tsx` — signed-in preference pass + render note.
- `components/matches/program-card.tsx` — render chip.
- `components/results/university-matches.tsx` — render chip on `MatchCard`.
- `components/results/results.tsx` — render `<PreferenceNote>` above `<UniversityMatches>`.
- `components/wizard/steps/goal-step.tsx` — subtext copy.
- `lib/analytics/events.ts` — add `"preference-note"` to `SourceSurface`.
- `tests/analytics/events.test.ts` — extend the two surface pins.
- `tests/components/matches/program-card.test.tsx` — chip test.
- `tests/components/university-matches.test.tsx` — chip test.
- `tests/results/assemble.test.ts` — assert `preferenceNote` in the payload.

---

## Task 1: Types foundation

**Files:**
- Modify: `lib/matches/types.ts`
- Modify: `lib/matching/universities.ts:10-14`
- Modify: `lib/results/types.ts`

Pure type additions — they unblock the engine and components. No runtime test; `npm run typecheck` is the gate.

- [ ] **Step 1: Add the chip field + `PreferenceNote` type to `lib/matches/types.ts`**

Add `preferenceChip` to `MatchResult` (after `reasons`) and append the `PreferenceNote` type at the end of the file:

```ts
export interface MatchResult {
  program: Program;
  university: University;
  verdict: MatchVerdict;
  reasons: MatchReason[];
  /** Set by the preference pass (lib/matches/preference.ts); absent on the eligibility-only path. */
  preferenceChip?: { text: string } | null;
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
```

- [ ] **Step 2: Add the chip field to `UniversityMatch` in `lib/matching/universities.ts`**

```ts
export interface UniversityMatch {
  university: UniversityData;
  matchLevel: MatchLevel;
  reason: string;
  /** Set by the preference pass; absent on the eligibility-only path. */
  preferenceChip?: { text: string } | null;
}
```

- [ ] **Step 3: Add `preferenceNote` to `AssessmentPayload` in `lib/results/types.ts`**

Add the import and the optional field:

```ts
import type { AssessmentResult } from "@/lib/scoring/types";
import type { UniversityMatch } from "@/lib/matching/universities";
import type { PreferenceNote } from "@/lib/matches/types";
import type { IntakeTiming } from "@/lib/timing/intake";
import type { ProfileAccuracy } from "./accuracy";

export interface AssessmentPayload {
  result: AssessmentResult;
  matches: UniversityMatch[];
  matchedCount: number;
  intake: IntakeTiming;
  accuracy: ProfileAccuracy;
  /** Oldest verification date across the scoring config's sourced inputs (F16). Absent on legacy stored payloads. */
  rulesVerified?: string;
  /** How the chosen goal shaped the match order. Absent on legacy stored payloads. */
  preferenceNote?: PreferenceNote | null;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors — these are additive optional fields).

- [ ] **Step 5: Commit**

```bash
git add lib/matches/types.ts lib/matching/universities.ts lib/results/types.ts
git commit -m "feat(matches): preference chip + note types (slice 7 foundation)"
```

---

## Task 2: Preference engine

**Files:**
- Create: `lib/matches/preference.ts`
- Test: `tests/matches/preference.test.ts`

The core. TDD against a synthetic adapter (decoupled from the concrete result shapes) plus direct tests of `parseNearestIntake`.

- [ ] **Step 1: Write the failing test `tests/matches/preference.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  applyPreference,
  parseNearestIntake,
  type PreferenceAdapter,
} from "@/lib/matches/preference";

// Synthetic item + adapter so the engine is tested independently of MatchResult/UniversityMatch.
interface Item {
  id: string;
  band: "strong" | "possible" | "reach";
  tier: number;
  tuition: number | null;
  intake: { at: number; label: string } | null;
  preferenceChip?: { text: string } | null;
}

const adapter: PreferenceAdapter<Item> = {
  band: (i) => i.band,
  signals: (i) => ({ rankingTier: i.tier, tuition: i.tuition, nearestIntake: i.intake }),
  withChip: (i, chip) => ({ ...i, preferenceChip: chip }),
};

const NOW = new Date(2026, 5, 14); // local midnight 14 Jun 2026 — same calendar frame as the impl's local getters
const ids = (items: Item[]) => items.map((i) => i.id);

function item(id: string, over: Partial<Item> = {}): Item {
  return { id, band: "strong", tier: 2, tuition: 30000, intake: null, ...over };
}

describe("applyPreference — null goal", () => {
  it("returns items unchanged and no note", () => {
    const items = [item("a"), item("b")];
    const out = applyPreference(items, null, adapter, NOW);
    expect(out.items).toBe(items);
    expect(out.note).toBeNull();
  });
});

describe("applyPreference — highest-ranked", () => {
  it("sorts by ranking tier ascending within band and chips tier 1 only", () => {
    const items = [
      item("t3", { tier: 3 }),
      item("t1", { tier: 1 }),
      item("t2", { tier: 2 }),
    ];
    const out = applyPreference(items, "highest-ranked", adapter, NOW);
    expect(ids(out.items)).toEqual(["t1", "t2", "t3"]);
    expect(out.items.find((i) => i.id === "t1")!.preferenceChip).toEqual({ text: "Tier-1 ranked" });
    expect(out.items.find((i) => i.id === "t2")!.preferenceChip).toBeNull();
    expect(out.note).toEqual({ kind: "ranked", text: "Ordered by your priority: highest-ranked university." });
  });
});

describe("applyPreference — lowest-cost", () => {
  it("sorts by tuition ascending and chips below the band median", () => {
    const items = [
      item("c30", { tuition: 30000 }),
      item("c10", { tuition: 10000 }),
      item("c20", { tuition: 20000 }),
    ];
    const out = applyPreference(items, "lowest-cost", adapter, NOW);
    expect(ids(out.items)).toEqual(["c10", "c20", "c30"]);
    // median of [10000,20000,30000] = 20000; strictly-below = only 10000
    expect(out.items.find((i) => i.id === "c10")!.preferenceChip).toEqual({ text: "Lower tuition" });
    expect(out.items.find((i) => i.id === "c20")!.preferenceChip).toBeNull();
    expect(out.note).toEqual({ kind: "ranked", text: "Ordered by your priority: lowest total cost." });
  });

  it("sorts null tuition last and never chips it", () => {
    const items = [item("none", { tuition: null }), item("c10", { tuition: 10000 })];
    const out = applyPreference(items, "lowest-cost", adapter, NOW);
    expect(ids(out.items)).toEqual(["c10", "none"]);
    expect(out.items.find((i) => i.id === "none")!.preferenceChip).toBeNull();
  });
});

describe("applyPreference — fastest-admission", () => {
  const soon = { at: new Date(2026, 7, 1).getTime(), label: "Aug 2026" }; // ~2 months
  const far = { at: new Date(2027, 4, 1).getTime(), label: "May 2027" }; // ~11 months

  it("sorts by nearest intake, chips within 6 months only, ranked note when rankable", () => {
    const items = [item("far", { intake: far }), item("soon", { intake: soon })];
    const out = applyPreference(items, "fastest-admission", adapter, NOW);
    expect(ids(out.items)).toEqual(["soon", "far"]);
    expect(out.items.find((i) => i.id === "soon")!.preferenceChip).toEqual({ text: "Next intake — Aug 2026" });
    expect(out.items.find((i) => i.id === "far")!.preferenceChip).toBeNull();
    expect(out.note).toEqual({ kind: "ranked", text: "Ordered by your priority: fastest admission." });
  });

  it("defers with the university-level note when no item has intake data", () => {
    const items = [item("a", { intake: null }), item("b", { intake: null })];
    const out = applyPreference(items, "fastest-admission", adapter, NOW);
    expect(ids(out.items)).toEqual(["a", "b"]); // unchanged
    expect(out.note).toEqual({
      kind: "deferred",
      text: "Intake timing is shared across these university-level results, so these matches stay ordered by eligibility. Program-level intake sorting appears after sign-in.",
    });
  });
});

describe("applyPreference — never crosses bands", () => {
  it("keeps a cheap reach below an expensive strong", () => {
    const items = [
      item("reach-cheap", { band: "reach", tuition: 1000 }),
      item("strong-pricey", { band: "strong", tuition: 99000 }),
    ];
    const out = applyPreference(items, "lowest-cost", adapter, NOW);
    expect(ids(out.items)).toEqual(["strong-pricey", "reach-cheap"]);
  });
});

describe("applyPreference — deferred goals", () => {
  it("PR yields the 485 context note and no reorder/chips", () => {
    const items = [item("a", { tier: 3 }), item("b", { tier: 1 })];
    const out = applyPreference(items, "permanent-residency", adapter, NOW);
    expect(ids(out.items)).toEqual(["a", "b"]); // unchanged
    expect(out.items.every((i) => !i.preferenceChip)).toBe(true);
    expect(out.note?.kind).toBe("pr-context");
    if (out.note?.kind === "pr-context") {
      expect(out.note.linkText).toBe("Subclass 485 Temporary Graduate visa");
      expect(out.note.after).toContain("stay ordered by eligibility");
      expect(out.note.source.href).toContain("temporary-graduate-485");
    }
  });

  it("employment and research yield the program-level deferred note", () => {
    expect(applyPreference([item("a")], "best-employment", adapter, NOW).note).toEqual({
      kind: "deferred",
      text: "We don't yet have program-level employment data, so these matches stay ordered by eligibility.",
    });
    expect(applyPreference([item("a")], "research", adapter, NOW).note).toEqual({
      kind: "deferred",
      text: "We don't yet have program-level research data, so these matches stay ordered by eligibility.",
    });
  });
});

describe("parseNearestIntake", () => {
  it("picks the soonest upcoming month, rolling past months to next year", () => {
    // now = 14 Jun 2026; "feb" already passed this year -> Feb 2027
    expect(parseNearestIntake(["feb"], NOW)).toEqual({
      at: new Date(2027, 1, 1).getTime(),
      label: "Feb 2027",
    });
    // "jul" is upcoming this year -> Jul 2026
    expect(parseNearestIntake(["jul"], NOW)).toEqual({
      at: new Date(2026, 6, 1).getTime(),
      label: "Jul 2026",
    });
  });

  it("chooses the nearest among several tokens", () => {
    const r = parseNearestIntake(["feb", "jul", "oct"], NOW);
    expect(r?.label).toBe("Jul 2026");
  });

  it("returns null for empty or unparseable tokens", () => {
    expect(parseNearestIntake([], NOW)).toBeNull();
    expect(parseNearestIntake(["someday"], NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/matches/preference.test.ts`
Expected: FAIL — `Cannot find module '@/lib/matches/preference'`.

- [ ] **Step 3: Implement `lib/matches/preference.ts`**

```ts
import type { Goal } from "@/lib/scoring/types";
import type { MatchResult, PreferenceNote } from "@/lib/matches/types";
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
  withChip: (item: T, chip: { text: string } | null) => T;
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

/** Soonest intake strictly after `now` across the tokens; null if none parse. Deterministic given `now`. */
export function parseNearestIntake(tokens: string[], now: Date): { at: number; label: string } | null {
  let best: { at: number; label: string } | null = null;
  for (const token of tokens) {
    const mi = MONTH_TOKENS[token.slice(0, 3).toLowerCase()];
    if (mi === undefined) continue;
    const candidate = new Date(now.getFullYear(), mi, 1);
    if (candidate.getTime() <= now.getTime()) candidate.setFullYear(now.getFullYear() + 1);
    const at = candidate.getTime();
    if (best === null || at < best.at) best = { at, label: `${MONTHS[mi]} ${candidate.getFullYear()}` };
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
  return at <= new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()).getTime();
}

function chipFor(goal: Goal, s: PreferenceSignals, bandMedian: number | null, now: Date): { text: string } | null {
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/matches/preference.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add lib/matches/preference.ts tests/matches/preference.test.ts
git commit -m "feat(matches): preference engine + adapters (sort, chips, notes)"
```

---

## Task 3: PreferenceNote component + analytics surface

**Files:**
- Create: `components/matches/preference-note.tsx`
- Test: `tests/components/matches/preference-note.test.tsx`
- Modify: `lib/analytics/events.ts:13-21`
- Modify: `tests/analytics/events.test.ts:65-67`

- [ ] **Step 1: Add the `"preference-note"` analytics surface**

In `lib/analytics/events.ts`, append to the `SourceSurface` union:

```ts
export type SourceSurface =
  | "factor-bars"
  | "refusal-recovery"
  | "cost-to-apply"
  | "checklist"
  | "matches"
  | "genuine-student"
  | "working-with-agents"
  | "policy-banner"
  | "preference-note";
```

- [ ] **Step 2: Update the surface pin in `tests/analytics/events.test.ts`**

Replace the `source_link_clicked.surface` `expectTypeOf` union (around line 65) to include the new member:

```ts
    expectTypeOf<AnalyticsEvents["source_link_clicked"]["surface"]>().toEqualTypeOf<
      "factor-bars" | "refusal-recovery" | "cost-to-apply" | "checklist" | "matches" | "genuine-student" | "working-with-agents" | "policy-banner" | "preference-note"
    >();
```

- [ ] **Step 3: Write the failing test `tests/components/matches/preference-note.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreferenceNote } from "@/components/matches/preference-note";
import type { PreferenceNote as PreferenceNoteData } from "@/lib/matches/types";

describe("PreferenceNote", () => {
  it("renders nothing when the note is absent", () => {
    const { container } = render(<PreferenceNote note={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a ranked note as plain text", () => {
    const note: PreferenceNoteData = { kind: "ranked", text: "Ordered by your priority: lowest total cost." };
    render(<PreferenceNote note={note} />);
    expect(screen.getByText("Ordered by your priority: lowest total cost.")).toBeInTheDocument();
  });

  it("renders a deferred note as plain text", () => {
    const note: PreferenceNoteData = {
      kind: "deferred",
      text: "We don't yet have program-level employment data, so these matches stay ordered by eligibility.",
    };
    render(<PreferenceNote note={note} />);
    expect(screen.getByText(/program-level employment data/)).toBeInTheDocument();
  });

  it("renders the PR note with a 485 source link", () => {
    const note: PreferenceNoteData = {
      kind: "pr-context",
      before: "You chose permanent residency. Australia has post-study pathways such as the ",
      linkText: "Subclass 485 Temporary Graduate visa",
      after: " after eligible study. We don't rank individual programs by PR outcome, so these matches stay ordered by eligibility.",
      source: { href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485", lastVerified: "2026-06-07" },
    };
    render(<PreferenceNote note={note} />);
    const link = screen.getByRole("link", { name: "Subclass 485 Temporary Graduate visa" });
    expect(link).toHaveAttribute("href", note.source.href);
    expect(screen.getByText(/post-study pathways/)).toBeInTheDocument();
    expect(screen.getByText(/stay ordered by eligibility/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run tests/components/matches/preference-note.test.tsx`
Expected: FAIL — `Cannot find module '@/components/matches/preference-note'`.

- [ ] **Step 5: Implement `components/matches/preference-note.tsx`**

```tsx
import type { PreferenceNote as PreferenceNoteData } from "@/lib/matches/types";
import { SourceAnchor } from "@/components/analytics/source-anchor";

export function PreferenceNote({ note }: { note: PreferenceNoteData | null | undefined }) {
  if (!note) return null;

  if (note.kind === "pr-context") {
    return (
      <p className="text-[14px] text-ink-soft">
        {note.before}
        <SourceAnchor
          surface="preference-note"
          href={note.source.href}
          title={note.source.lastVerified ? `verified ${note.source.lastVerified}` : undefined}
          className="text-ink underline underline-offset-2 hover:text-primary"
        >
          {note.linkText}
        </SourceAnchor>
        {note.after}
      </p>
    );
  }

  return <p className="text-[14px] text-ink-soft">{note.text}</p>;
}
```

- [ ] **Step 6: Run the component test + the analytics pin**

Run: `npx vitest run tests/components/matches/preference-note.test.tsx tests/analytics/events.test.ts`
Expected: PASS (both files).

- [ ] **Step 7: Typecheck + commit**

```bash
npm run typecheck
git add components/matches/preference-note.tsx tests/components/matches/preference-note.test.tsx lib/analytics/events.ts tests/analytics/events.test.ts
git commit -m "feat(matches): preference-note component + preference-note source surface"
```

---

## Task 4: Wire the anonymous results pass

**Files:**
- Modify: `lib/results/assemble.ts`
- Test: `tests/results/assemble.test.ts`

- [ ] **Step 1: Add failing assertions to `tests/results/assemble.test.ts`**

The `aarav` fixture has `goal: "permanent-residency"`, so the payload must carry the PR-context note. Add inside the `describe("assembleAssessment", ...)` block:

```ts
  it("carries the preference note for the chosen goal (PR -> 485 context)", () => {
    const payload = assembleAssessment(aarav, new Date("2026-06-03"));
    expect(payload.preferenceNote?.kind).toBe("pr-context");
  });

  it("ranks by lowest cost when that goal is chosen and chips the cheaper universities", () => {
    const payload = assembleAssessment({ ...aarav, goal: "lowest-cost" }, new Date("2026-06-03"));
    expect(payload.preferenceNote).toEqual({
      kind: "ranked",
      text: "Ordered by your priority: lowest total cost.",
    });
    // at least one surfaced match earns the Lower tuition chip
    expect(payload.matches.some((m) => m.preferenceChip?.text === "Lower tuition")).toBe(true);
    // tuition is non-decreasing within the first (strong) band
    const strong = payload.matches.filter((m) => m.matchLevel === "strong");
    const tuitions = strong.map((m) => m.university.tuitionUsdPerYear.min);
    expect([...tuitions].sort((a, b) => a - b)).toEqual(tuitions);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/results/assemble.test.ts`
Expected: FAIL — `payload.preferenceNote` is `undefined`.

- [ ] **Step 3: Apply the preference pass in `lib/results/assemble.ts`**

```ts
import type { StudentProfile } from "@/lib/scoring/types";
import { runAssessment } from "@/lib/scoring/engine";
import { matchUniversities } from "@/lib/matching/universities";
import { applyPreference, anonymousPreferenceAdapter } from "@/lib/matches/preference";
import { computeIntakeTiming } from "@/lib/timing/intake";
import { computeProfileAccuracy } from "./accuracy";
import { AUSTRALIA } from "@/lib/data/destination/australia";
import { CONFIG_RULES_VERIFIED } from "@/lib/data/scoring-config";
import type { AssessmentPayload } from "./types";

// MVP: every corridor resolves to Australia data. "not-sure" and other
// destinations default to Australia with a "more countries coming" note in the UI.
export function assembleAssessment(profile: StudentProfile, now: Date = new Date()): AssessmentPayload {
  const { items: matches, note: preferenceNote } = applyPreference(
    matchUniversities(profile),
    profile.goal,
    anonymousPreferenceAdapter,
    now,
  );
  return {
    result: runAssessment(profile),
    matches,
    matchedCount: matches.length,
    intake: computeIntakeTiming(profile, AUSTRALIA, now),
    accuracy: computeProfileAccuracy(profile),
    rulesVerified: CONFIG_RULES_VERIFIED,
    preferenceNote,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/results/assemble.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/results/assemble.ts tests/results/assemble.test.ts
git commit -m "feat(results): apply preference pass to anonymous wizard results"
```

---

## Task 5: Render the chip + note on the anonymous results

**Files:**
- Modify: `components/results/university-matches.tsx:18-34`
- Modify: `components/results/results.tsx:17,77-83`
- Test: `tests/components/university-matches.test.tsx`

- [ ] **Step 1: Add a failing chip test to `tests/components/university-matches.test.tsx`**

Add inside the `describe("UniversityMatches", ...)` block:

```ts
  it("renders a preference chip when one is set on a surfaced match", () => {
    const chipped: UniversityMatch[] = [
      { ...matches[0]!, preferenceChip: { text: "Lower tuition" } },
      ...matches.slice(1),
    ];
    render(<UniversityMatches matches={chipped} total={12} onUnlock={vi.fn()} />);
    expect(screen.getByText("Lower tuition")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/university-matches.test.tsx`
Expected: FAIL — "Lower tuition" not found.

- [ ] **Step 3: Render the chip in `MatchCard` (`components/results/university-matches.tsx`)**

Replace the `MatchCard` header block so the chip sits beside the level pill:

```tsx
function MatchCard({ m }: { m: UniversityMatch }) {
  return (
    <article className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-ink">{m.university.name}</span>
        <div className="flex items-center gap-2">
          {m.preferenceChip ? (
            <span className="inline-flex items-center rounded-pill border border-line px-2.5 py-0.5 font-mono text-[11px] text-ink-soft">
              {m.preferenceChip.text}
            </span>
          ) : null}
          <span className={cn("rounded-pill px-2.5 py-0.5 font-mono text-[11.5px]", LEVEL_CLS[m.matchLevel])}>
            {LEVEL_LABEL[m.matchLevel]}
          </span>
        </div>
      </div>
      <p className="mt-1 text-[15px] text-ink-soft">
        {m.university.city} · {formatUsd(m.university.tuitionUsdPerYear.min)}–
        {formatUsd(m.university.tuitionUsdPerYear.max)}/yr
      </p>
      <p className="mt-1 text-[15px] text-ink-soft">{m.reason}</p>
    </article>
  );
}
```

- [ ] **Step 4: Render the note above the list in `components/results/results.tsx`**

Add the import near the other component imports:

```tsx
import { PreferenceNote } from "@/components/matches/preference-note";
```

Then wrap the matches block so the note renders above it:

```tsx
      <IntakeTimingCard intake={payload.intake} />
      <PreferenceNote note={payload.preferenceNote} />
      <UniversityMatches
        matches={payload.matches}
        total={payload.matchedCount}
        onUnlock={scrollToConversion}
        unlocked={owned}
      />
```

- [ ] **Step 5: Run the test + typecheck**

Run: `npx vitest run tests/components/university-matches.test.tsx`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/results/university-matches.tsx components/results/results.tsx tests/components/university-matches.test.tsx
git commit -m "feat(results): render preference chip + note on anonymous results"
```

---

## Task 6: Wire + render the signed-in `/matches` page

**Files:**
- Modify: `app/(app)/matches/page.tsx:8,34-54`
- Modify: `components/matches/program-card.tsx:26-54`
- Test: `tests/components/matches/program-card.test.tsx`

The page is a server component backed by Supabase, so it is verified by typecheck + the engine tests; the card chip gets a render test.

- [ ] **Step 1: Add a failing chip test to `tests/components/matches/program-card.test.tsx`**

```ts
  it("renders a preference chip when one is set", () => {
    render(<ProgramCard match={{ ...m, preferenceChip: { text: "Tier-1 ranked" } }} isShortlisted={false} />);
    expect(screen.getByText("Tier-1 ranked")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/matches/program-card.test.tsx`
Expected: FAIL — "Tier-1 ranked" not found.

- [ ] **Step 3: Render the chip in `components/matches/program-card.tsx`**

Destructure `preferenceChip` and render it beside the verdict pill. Change the destructure line:

```tsx
  const { program: p, university: u, verdict, reasons, preferenceChip } = match;
```

Replace the bare verdict `<span>` in the header with a chip+verdict group:

```tsx
        <div className="flex flex-wrap items-center justify-end gap-2">
          {preferenceChip ? (
            <span className="inline-flex items-center rounded-pill border border-line px-2.5 py-0.5 font-mono text-[11px] text-ink-soft">
              {preferenceChip.text}
            </span>
          ) : null}
          <span
            className={`inline-flex items-center rounded-pill px-3 py-1 font-mono text-[12px] ${VERDICT_CLS[verdict]}`}
          >
            {VERDICT_LABEL[verdict]}
          </span>
        </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/matches/program-card.test.tsx`
Expected: PASS (new test + the 5 existing tests still green).

- [ ] **Step 5: Apply the preference pass in `app/(app)/matches/page.tsx`**

Add the imports:

```tsx
import { computeMatches } from "@/lib/matches/compute";
import { applyPreference, signedInPreferenceAdapter } from "@/lib/matches/preference";
import { PreferenceNote } from "@/components/matches/preference-note";
```

Replace the match computation + grouping (currently lines ~35-41):

```tsx
  const sections: ProfileSections = (profile?.sections as ProfileSections | undefined) ?? {};
  const inputs = sectionsToMatchInputs(sections, { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });

  const { items: matches, note: preferenceNote } = applyPreference(
    computeMatches(inputs, programs, universities),
    sections.career?.goal ?? null,
    signedInPreferenceAdapter,
    new Date(),
  );
  const shortlistedIds = new Set(shortlist.map((s) => s.programId));
  const strong = matches.filter((m) => m.verdict === "strong");
  const possible = matches.filter((m) => m.verdict === "possible");
  const reach = matches.filter((m) => m.verdict === "reach");
```

Render the note at the top of the universities panel:

```tsx
  const universitiesPanel = (
    <div className="flex flex-col gap-6">
      <PreferenceNote note={preferenceNote} />
      <VerdictGroup verdict="strong" matches={strong} shortlistedIds={shortlistedIds} />
      <VerdictGroup verdict="possible" matches={possible} shortlistedIds={shortlistedIds} />
      <VerdictGroup verdict="reach" matches={reach} shortlistedIds={shortlistedIds} />
      {matches.length === 0 ? (
        <p className="text-[15px] text-ink-soft">
          No programs found yet. Complete your profile to surface matches.
        </p>
      ) : null}
    </div>
  );
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/matches/page.tsx" components/matches/program-card.tsx tests/components/matches/program-card.test.tsx
git commit -m "feat(matches): apply preference pass + render chip/note on signed-in matches"
```

---

## Task 7: Fix the wizard overpromise

**Files:**
- Modify: `components/wizard/steps/goal-step.tsx:22`
- Test: `tests/components/wizard/goal-step.test.tsx`

- [ ] **Step 1: Write the failing copy-lock `tests/components/wizard/goal-step.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoalStep } from "@/components/wizard/steps/goal-step";

describe("GoalStep copy", () => {
  it("subtext is honest about partial preference coverage", () => {
    render(<GoalStep profile={{}} setField={() => {}} callouts={null} />);
    expect(
      screen.getByText(
        "We use this to order and label your matches around what you care about — where we have the data to.",
      ),
    ).toBeInTheDocument();
  });

  it("drops the old rank-everything overpromise", () => {
    render(<GoalStep profile={{}} setField={() => {}} callouts={null} />);
    expect(screen.queryByText(/shapes how we rank your matches/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/wizard/goal-step.test.tsx`
Expected: FAIL — the new subtext is not present (old copy still rendered).

- [ ] **Step 3: Update the subtext in `components/wizard/steps/goal-step.tsx`**

Change the `subtext` prop on `<StepShell>`:

```tsx
      subtext="We use this to order and label your matches around what you care about — where we have the data to."
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/wizard/goal-step.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add components/wizard/steps/goal-step.tsx tests/components/wizard/goal-step.test.tsx
git commit -m "feat(wizard): honest goal-step subtext (no rank-everything overpromise)"
```

---

## Task 8: Full verification, governance, and close

**Files:**
- Modify: `docs/PROJECT_STATUS.md`
- Modify: `C:\Users\thapa\.claude\projects\C--Users-thapa-OneDrive-Desktop-work-merovisa\memory\value-triage-lane.md` and `MEMORY.md`

- [ ] **Step 1: Full suite + typecheck + lint**

Run: `npm test`
Expected: all green, including `tests/scoring/characterization.test.ts` and any golden/snapshot tests unchanged (we touched no scoring code).
Run: `npm run typecheck`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 2: Production build (server/client boundary smoke)**

Run: `npm run build`
Expected: PASS — confirms `lib/matches/preference.ts` (which imports the 485 sourced module) is not pulled into any client bundle.

- [ ] **Step 3: Golden + ledger governance check**

Confirm no scoring golden moved and no unexpected ledger churn:

```powershell
$env:FLIP_STATUS = "1"; npx vitest run tests/data/flip-status.run.test.ts
git status --short docs/research-briefs/findings
```

Expected: zero ledger changes — the 485 module's `findingRefs` (C.038–C.043, E.015, E.016, C.046, C.047) are already "used" by the module's existence, so surfacing it in the UI moves nothing. If anything shows as changed, stop and investigate before continuing. Remove the env var afterward: `Remove-Item Env:FLIP_STATUS`.

- [ ] **Step 4: Confirm the WIP trio is still dirty and untouched**

Run: `git status --short`
Expected: ` M CLAUDE.md`, ` M tests/integration/wizard-to-results.test.tsx`, `?? docs/debugging/` all still present and unmodified by this slice.

- [ ] **Step 5: Update `docs/PROJECT_STATUS.md`**

Add a slice ⑦ entry under the current phase log: preference-fit matching shipped on both result surfaces; eligibility/preference separated; goals rank/cost/intake wired with chips; PR/employment/research deferred honestly; anonymous fastest-admission deferred with the after-sign-in note; no scoring/golden movement; suite delta recorded.

- [ ] **Step 6: Update memory (`value-triage-lane.md` + `MEMORY.md`)**

Record slice ⑦ complete; note the strategic finding is now resolved (goals wired into ranking on both surfaces); next backlog items unchanged (1 July re-verify checkpoint; feed-vs-extension fork).

- [ ] **Step 7: Final commit + push**

```bash
git add docs/PROJECT_STATUS.md
git commit -m "docs(status): record preference-fit matching slice 7"
git push
```

(Memory files live outside the repo — they are saved via the memory tooling, not committed.)

---

## Self-Review

**Spec coverage:**
- Shared `applyPreference<T>` + adapters → Task 2. ✓
- Both surfaces wired (anonymous Task 4/5, signed-in Task 6). ✓
- Within-band sort, never crosses verdict → Task 2 ("never crosses bands" test). ✓
- Per-goal table (rank/cost/intake ranked; PR/employment/research deferred; anonymous fastest-admission deferred) → Task 2 buildNote + tests. ✓
- Chip thresholds (tier-1, below-median, ≤6mo) → Task 2 chipFor + tests. ✓
- Copy (chips, four notes, wizard A) → Tasks 2, 5, 6, 7 with copy-locks. ✓
- 485 cited via `au-temporary-graduate-visa`, payload-carried → Task 2 buildNote, Task 3 component. ✓
- Client-bundle safety (preference.ts server-only; types client-safe) → Task 1 type placement + Task 8 build. ✓
- No scoring/golden movement → Task 8 governance check. ✓
- New analytics surface → Task 3. ✓

**Placeholder scan:** none — every step carries full code or an exact command.

**Type consistency:** `preferenceChip: { text: string } | null` is identical on `MatchResult` (Task 1) and `UniversityMatch` (Task 1) and is what `adapter.withChip` returns (Task 2) and what the cards read (Tasks 5, 6). `PreferenceNote` is defined once in `lib/matches/types.ts` (Task 1) and consumed by `preference.ts` (Task 2), `results/types.ts` (Task 1), and `preference-note.tsx` (Task 3). `applyPreference` signature `(items, goal, adapter, now?)` is identical at both call sites (Tasks 4, 6).
