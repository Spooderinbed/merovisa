# Goal Trade-off Note (MV-105 Layer B, Option 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface ONE honest sentence when a student's primary goal and one of their secondary goals pull in different directions — turning the (deliberately inert) Layer A `secondaryGoals` capture into an honest, score-inert, order-inert insight.

**Architecture:** A new pure function `goalTradeoffNote(primary, secondaryGoals)` (mirroring `lib/scoring/field-note.ts`'s `competitivenessNote`) returns at most one note from a small ordered tension table. It is computed where `secondaryGoals` is in scope (the `assembleAssessment` seam for anonymous results; inline on the signed-in matches page) and rendered by a new `<GoalTradeoffNote>` component as a *sibling* immediately after the existing `<PreferenceNote>`. It never feeds a score or a sort — the sorter (`applyPreference`) doesn't even receive secondaries.

**Tech Stack:** TypeScript (strict), Next.js App Router, Tailwind ("calm authority" tokens), Vitest.

---

## Design decisions (the locked brainstorm output)

- **Option chosen:** Option 1 — inline trade-off note (context-only). Rejected: silent secondary re-rank (invisible + uneven data), goal-weighted fit score (breaks inertness, fabricates a verdict), and the modal pattern (a goal tension is *knowable, not fixable*, so it must never block flow — the note is inline/non-blocking, mirroring Hers' below-result caveat, not Runway/Deel/Dropbox modals).
- **Honesty bar (why v1 needs no new citations):** the two shipped notes assert **no external fact** — they name a directional trade-off in what the student is optimising for. That is framing, not a data point, so it needs no `source`/`lastVerified` (same bar `competitivenessNote` clears).
- **Deliberately DEFERRED to a sourced follow-up** (each asserts a citable fact and must carry a `source` before shipping): the `fastest-admission ↔ research` tension (admissions-timeline claim), and every SYNERGY pair (`highest-ranked ↔ research` needs a Go8 source; `permanent-residency ↔ lowest-cost` needs a regional-study migration source). `best-employment` pairs stay silent (no program-level employment data).
- **One note, ever.** Selection walks an ordered priority list and returns the first tension where the **primary** is one side and a **secondary** is the other. Prioritise `permanent-residency ↔ highest-ranked`, then `lowest-cost ↔ highest-ranked`.
- **Copy is symmetric and direct** (names both goals, implies neither is "wrong"), so a single fixed string reads correctly whichever of the pair is the primary.
- **Placement:** both surfaces, immediately after `<PreferenceNote>`, before the match list.

---

## File Structure

- **Create** `lib/goals/conflicts.ts` — the tension table + `goalTradeoffNote()` pure function and its `GoalTradeoffNote` type. One responsibility: derive the honest note from two goal selections.
- **Create** `components/matches/goal-tradeoff-note.tsx` — presentational sibling of `preference-note.tsx`; renders the note text or nothing.
- **Create** `tests/goals/conflicts.test.ts` — unit coverage for the pure function (fires, doesn't fire, priority, symmetry, purity).
- **Modify** `lib/results/types.ts` — add `goalTradeoffNote?` to `AssessmentPayload`.
- **Modify** `lib/results/assemble.ts` — compute the note from the scored profile and attach it to the payload.
- **Modify** `components/results/results.tsx` — render `<GoalTradeoffNote>` after `<PreferenceNote>` (anonymous surface).
- **Modify** `app/(app)/matches/page.tsx` — compute inline from `sections.career` and render (signed-in surface).

No migration (all fields are existing JSONB). No scoring-engine change.

---

## Task 0: Kanban card + branch

**Files:**
- Modify: `docs/kanban/board.json`

- [ ] **Step 1: Sync and branch off production**

```bash
git fetch origin
git switch -c mv-111-goal-tradeoff-note origin/master
```
(If `mv-111` is taken on the board, use the next free `mv-NN` and match the id below.)

- [ ] **Step 2: Add the Layer B card to `board.json`**

Read `docs/kanban/board.json`, allocate the next free `MV-NN` id (expected `MV-111`), and add a card in `In Progress` (respecting WIP 1 — move any other In-Progress card to In Review/Ready first if needed):

```json
{
  "id": "MV-111",
  "title": "MV-105 Layer B — honest goal trade-off note (Option 1)",
  "col": "in-progress",
  "priority": "P1",
  "owner": "agent",
  "entered": "2026-07-07"
}
```

- [ ] **Step 3: Regenerate the board views**

Run: `npm run board`
Expected: `docs/kanban/board.md` + `board.html` regenerate with the new card. Do NOT hand-edit them.

- [ ] **Step 4: Commit (exclude untracked `.claude/**`)**

```bash
git add -A -- ':!.claude'
git commit -F- <<'EOF'
chore(board): MV-111 goal trade-off note → In Progress
EOF
```

---

## Task 1: The pure tension function

**Files:**
- Create: `lib/goals/conflicts.ts`
- Test: `tests/goals/conflicts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/goals/conflicts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { goalTradeoffNote } from "@/lib/goals/conflicts";
import type { Goal } from "@/lib/scoring/types";

describe("goalTradeoffNote — honest, inert goal trade-off note", () => {
  it("returns null when there is no primary goal", () => {
    expect(goalTradeoffNote(null, ["highest-ranked"])).toBeNull();
  });

  it("returns null when there are no secondary goals", () => {
    expect(goalTradeoffNote("permanent-residency", undefined)).toBeNull();
    expect(goalTradeoffNote("permanent-residency", [])).toBeNull();
  });

  it("returns null when no secondary tensions with the primary", () => {
    // research + best-employment is not a v1 tension pair
    expect(goalTradeoffNote("research", ["best-employment"])).toBeNull();
  });

  it("fires for permanent-residency (primary) + highest-ranked (secondary)", () => {
    const note = goalTradeoffNote("permanent-residency", ["highest-ranked"]);
    expect(note).not.toBeNull();
    expect(note?.kind).toBe("tension");
    expect(note?.primary).toBe("permanent-residency");
    expect(note?.secondary).toBe("highest-ranked");
    expect(note?.text.length).toBeGreaterThan(0);
  });

  it("fires symmetrically when the roles are reversed", () => {
    // primary = highest-ranked, secondary = permanent-residency → same pair
    const note = goalTradeoffNote("highest-ranked", ["permanent-residency"]);
    expect(note?.secondary).toBe("permanent-residency");
    expect(note?.text).toContain("Permanent residency");
  });

  it("fires for lowest-cost + highest-ranked", () => {
    const note = goalTradeoffNote("lowest-cost", ["highest-ranked"]);
    expect(note?.primary).toBe("lowest-cost");
    expect(note?.secondary).toBe("highest-ranked");
  });

  it("returns the higher-priority pair when several tension", () => {
    // primary = highest-ranked; secondaries include BOTH pr and lowest-cost.
    // pr↔ranked outranks cost↔ranked → the pr pair wins.
    const note = goalTradeoffNote("highest-ranked", [
      "lowest-cost",
      "permanent-residency",
    ]);
    expect(note?.secondary).toBe("permanent-residency");
  });

  it("is pure — does not mutate its inputs and is deterministic", () => {
    const secondaries: Goal[] = ["highest-ranked"];
    const a = goalTradeoffNote("permanent-residency", secondaries);
    const b = goalTradeoffNote("permanent-residency", secondaries);
    expect(a).toEqual(b);
    expect(secondaries).toEqual(["highest-ranked"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/goals/conflicts.test.ts`
Expected: FAIL — `Cannot find module "@/lib/goals/conflicts"`.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/goals/conflicts.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/goals/conflicts.test.ts`
Expected: PASS (8 assertions across the describe block).

- [ ] **Step 5: Commit**

```bash
git add lib/goals/conflicts.ts tests/goals/conflicts.test.ts
git commit -F- <<'EOF'
feat(goals): MV-111 honest goal trade-off note function (score/order-inert)
EOF
```

---

## Task 2: The presentational component

**Files:**
- Create: `components/matches/goal-tradeoff-note.tsx`

- [ ] **Step 1: Write the component**

Create `components/matches/goal-tradeoff-note.tsx` (mirrors the styling of `components/matches/preference-note.tsx` exactly — `text-meta text-ink-soft`):

```tsx
import type { GoalTradeoffNote as GoalTradeoffNoteData } from "@/lib/goals/conflicts";

/**
 * Renders the single honest goal trade-off note as a calm, non-blocking line —
 * a sibling of <PreferenceNote>, never a modal (a goal tension is knowable, not
 * fixable). Returns nothing when there is no note.
 */
export function GoalTradeoffNote({
  note,
}: {
  note: GoalTradeoffNoteData | null | undefined;
}) {
  if (!note) return null;
  return <p className="text-meta text-ink-soft">{note.text}</p>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors; the component compiles against the Task 1 type).

- [ ] **Step 3: Commit**

```bash
git add components/matches/goal-tradeoff-note.tsx
git commit -F- <<'EOF'
feat(matches): MV-111 GoalTradeoffNote presentational component
EOF
```

---

## Task 3: Attach the note to the anonymous results payload

**Files:**
- Modify: `lib/results/types.ts` (add optional payload field, mirroring `competitivenessNote?`)
- Modify: `lib/results/assemble.ts:57-62` (compute + attach in `assembleAssessment`)

- [ ] **Step 1: Add the payload field**

In `lib/results/types.ts`, add the import near the other type imports:

```ts
import type { GoalTradeoffNote } from "@/lib/goals/conflicts";
```

and add this field to the `AssessmentPayload` interface, immediately after the existing `competitivenessNote?` field:

```ts
  /**
   * Honest note when the primary goal and a secondary goal pull in different
   * directions (lib/goals/conflicts.ts). Score-inert and order-inert — display
   * only. Absent/null when nothing tensions.
   */
  goalTradeoffNote?: GoalTradeoffNote | null;
```

- [ ] **Step 2: Compute and attach it in `assembleAssessment`**

In `lib/results/assemble.ts`, add the import near the top:

```ts
import { goalTradeoffNote } from "@/lib/goals/conflicts";
```

Then, in the returned payload object (right after the existing `competitivenessNote: competitivenessNote(scored.fieldOfStudy, scored.alsoConsidering),` line, ~`assemble.ts:62`), add:

```ts
    goalTradeoffNote: goalTradeoffNote(scored.goal, scored.secondaryGoals),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Verify scoring/order inertness still holds**

Run: `npx vitest run tests/scoring/secondary-goals-inert.test.ts`
Expected: PASS — the existing honesty guarantee (secondaries never move the verdict) is untouched. Ordering is structurally inert because `applyPreference` never receives `secondaryGoals`.

- [ ] **Step 5: Commit**

```bash
git add lib/results/types.ts lib/results/assemble.ts
git commit -F- <<'EOF'
feat(results): MV-111 carry goal trade-off note on the assessment payload
EOF
```

---

## Task 4: Render on the anonymous results surface

**Files:**
- Modify: `components/results/results.tsx:18` (import) and `:91` (render sibling)

- [ ] **Step 1: Import the component**

In `components/results/results.tsx`, add near the existing `PreferenceNote` import (`results.tsx:18`):

```tsx
import { GoalTradeoffNote } from "@/components/matches/goal-tradeoff-note";
```

- [ ] **Step 2: Render it after `<PreferenceNote>`**

Insert immediately after the existing `<PreferenceNote note={payload.preferenceNote} />` line (`results.tsx:91`):

```tsx
      <PreferenceNote note={payload.preferenceNote} />
      <GoalTradeoffNote note={payload.goalTradeoffNote} />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/results/results.tsx
git commit -F- <<'EOF'
feat(results): MV-111 render goal trade-off note under the preference note
EOF
```

---

## Task 5: Compute + render on the signed-in matches surface

**Files:**
- Modify: `app/(app)/matches/page.tsx:20` (import), `:61` (compute), `:68` (render sibling)

The matches page does not reconstruct a `StudentProfile`; it reads `ProfileSections`. `secondaryGoals` lives at `sections.career?.secondaryGoals` and the primary at `sections.career?.goal`.

- [ ] **Step 1: Import both the function and the component**

In `app/(app)/matches/page.tsx`, near the existing `PreferenceNote` import (`page.tsx:20`):

```tsx
import { GoalTradeoffNote } from "@/components/matches/goal-tradeoff-note";
import { goalTradeoffNote } from "@/lib/goals/conflicts";
```

- [ ] **Step 2: Compute the note where the preference note is built**

Immediately after the existing `applyPreference(...)` destructure block (`page.tsx:53-61`), add:

```tsx
      const goalNote = goalTradeoffNote(
        sections.career?.goal ?? null,
        sections.career?.secondaryGoals,
      );
```

- [ ] **Step 3: Render it after `<PreferenceNote>`**

Insert immediately after the existing `<PreferenceNote note={preferenceNote} />` line (`page.tsx:68`):

```tsx
          <PreferenceNote note={preferenceNote} />
          <GoalTradeoffNote note={goalNote} />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/matches/page.tsx"
git commit -F- <<'EOF'
feat(matches): MV-111 render goal trade-off note on signed-in matches
EOF
```

---

## Task 6: Full gate, evidence, board move, PR

**Files:**
- Modify: `docs/kanban/board.json` (→ In Review), `docs/kanban/cards/MV-111.md` (evidence)

- [ ] **Step 1: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck clean, lint clean, full Vitest suite green (baseline ~1775 passing + the new `tests/goals/conflicts.test.ts`). If anything fails, fix before proceeding.

- [ ] **Step 2: Record evidence on the dossier**

Create/update `docs/kanban/cards/MV-111.md` with: the Option-1 decision, the v1 tension pairs shipped, the deferred sourced pairs, acceptance criteria (note fires for the 2 tension combos on both surfaces; inert test green), and the gate output (typecheck/lint/test counts).

- [ ] **Step 3: Move the card to In Review and regenerate**

Set `MV-111` `col` to `in-review` and `entered` to `2026-07-07` in `docs/kanban/board.json`, then:

Run: `npm run board`
Expected: board views regenerate.

- [ ] **Step 4: Commit the board + dossier**

```bash
git add -A -- ':!.claude'
git commit -F- <<'EOF'
docs(kanban): MV-111 → In Review (goal trade-off note, gate green)
EOF
```

- [ ] **Step 5: Push and open the PR (merge stays founder-gated)**

```bash
git push -u origin mv-111-goal-tradeoff-note
```

Write the PR body to a temp file and open with `--body-file`. Do NOT merge — leave the merge for the founder (never `--admin`, never bypass checks). The CI `integration` job may be red (empty Supabase test secrets); trust the `validate` job.

---

## Self-Review

**1. Spec coverage.** Option 1 = inline note after `PreferenceNote` on both surfaces → Tasks 4 (anon) + 5 (signed-in). Score/order-inert → structural (sorter never sees secondaries) + Task 3 Step 4 re-runs the inert guarantee. Ordered single-note selection + priority → Task 1 `TENSIONS` list + priority test. No-citation-needed v1 + deferred sourced pairs → Design-decisions section + code comment. Kanban ritual → Tasks 0 + 6. ✅

**2. Placeholder scan.** Every code step shows complete code; every command has an expected result. The only lookup ("allocate next free MV-NN") is a concrete action, not a TODO. ✅

**3. Type consistency.** `GoalTradeoffNote` (type) and `goalTradeoffNote` (function) are used identically in conflicts.ts (Task 1), the component (Task 2), the payload field (Task 3), and both render sites (Tasks 4–5). The component aliases the type as `GoalTradeoffNoteData` to avoid a name clash with the component export — consistent with how `preference-note.tsx` aliases `PreferenceNoteData`. `primary` accepts `Goal | null | undefined` so the matches page's `sections.career?.goal ?? null` type-checks. ✅
