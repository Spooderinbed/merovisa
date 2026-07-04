# Per-field verdicts (MV-102) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote MV-99's "also-considering" fields from an exploratory text hint into real banded verdicts (Strong/Possible/Reach) on the results page, with a low-pressure pivot callout when a secondary field strictly outranks the primary.

**Architecture:** A new pure module re-scores the same student in each also-considering field via `runAssessment` (only `fieldOfStudy` swapped), keeping only the band. Assembly attaches the result to the payload; a presentational component renders compact, clearly-conditional secondary bands beneath the unchanged primary `VerdictCard`. Both data-flow builders (anonymous wizard + signed-in re-score) must carry `alsoConsidering`. No DB, no migration, primary path byte-identical.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind (design tokens), Zod, vitest + React Testing Library.

**Source of truth:** `docs/superpowers/specs/2026-07-04-per-field-verdicts-design.md` (rev 3). Every task below references it — read the relevant section before implementing. Full implementation code for the pure module and component lives there; this plan sequences the work and pins the behaviour each test must lock.

**Discipline:** TDD (failing test first, watch it fail, minimal impl, watch it pass, commit). One task = one commit. Run the narrow test after each impl step; run the full gate (`npm run typecheck && npm run lint && npm test`) only at Task 10.

---

## Task 1: Signed-in path forwards `alsoConsidering` (blocker B1)

**Files:**
- Modify: `lib/scoring/from-sections.ts` (~line 47, `sectionsToStudentProfile`)
- Test: `tests/scoring/from-sections.test.ts`

Spec: "Both data-flow paths must carry `alsoConsidering`" (design §, lines 114-126).

- [ ] **Step 1: Write the failing test** — mirror the existing dependents/family round-trip tests in this file. Given sections with `"intended-study": { field: "computer-science", alsoConsidering: ["business"] }`, assert `sectionsToStudentProfile(sections).alsoConsidering` deep-equals `["business"]`. Add a second case: no `alsoConsidering` key → the result's `alsoConsidering` is `undefined`.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- from-sections` → FAIL (currently `undefined`).
- [ ] **Step 3: Implement** — in the returned object, add `alsoConsidering: study?.alsoConsidering` (type-clean: `ProfileSections["intended-study"].alsoConsidering` already matches `StudentProfile.alsoConsidering`; no `exactOptionalPropertyTypes` in this repo).
- [ ] **Step 4: Run it, verify it passes** — `npm test -- from-sections` → PASS.
- [ ] **Step 5: Commit** — `feat(mv-102): forward alsoConsidering through signed-in re-score path`.

---

## Task 2: `IntendedStudyPatch` disjoint/dedup validation

**Files:**
- Modify: `lib/validation/profile-section.ts` (`IntendedStudyPatch`, ~lines 38-43)
- Test: `tests/validation/profile-section.test.ts` (create if absent; else co-locate with existing validation tests)

Spec: "Validation gap" (design lines 198-202) + rev-3 build detail "reuse `ALSO_CONSIDERING_CAP`" (line 309). The cap constant is exported from `lib/validation/profile.ts:16`.

- [ ] **Step 1: Write the failing test** — three cases against `ProfileSectionPatchBodySchema` (or `IntendedStudyPatch` directly if exported):
  - `{ section: "intended-study", patch: { field: "computer-science", alsoConsidering: ["computer-science"] } }` → parse **fails** (contains primary).
  - `patch: { alsoConsidering: ["business", "business"] }` → parse **fails** (duplicate).
  - `patch: { field: "computer-science", alsoConsidering: ["business", "nursing"] }` → parse **succeeds**.
  Note: the refine can only check disjointness when `field` is present in the same patch; when `field` is absent, only dedup + cap apply. Assert accordingly.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- profile-section` → the primary-containing and duplicate cases currently PASS parsing (wrong) → test FAILS.
- [ ] **Step 3: Implement** — import `ALSO_CONSIDERING_CAP` from `@/lib/validation/profile`; change `.max(2)` to `.max(ALSO_CONSIDERING_CAP)`; add `.refine` on the object: no duplicates in `alsoConsidering`, and when `patch.field` is set it must not appear in `alsoConsidering`. Mirror the refine already on `ProfileSchema` in `lib/validation/profile.ts` for message parity.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- profile-section` → PASS.
- [ ] **Step 5: Commit** — `feat(mv-102): enforce disjoint/dedup alsoConsidering on IntendedStudyPatch`.

---

## Task 3: Pure module `computeSecondaryVerdicts`

**Files:**
- Create: `lib/results/secondary-verdicts.ts`
- Test: `tests/results/secondary-verdicts.test.ts`

Spec: "New pure module" (design lines 62-99). Interfaces `SecondaryVerdict` / `SecondaryVerdicts` and the function signature are given verbatim there — implement exactly.

- [ ] **Step 1: Write the failing tests** covering every bullet in spec "Testing" (lines 208-220). Build profiles with `makeProfile`-style helpers already used in `tests/results/` or `tests/scoring/`. Cases:
  - empty / undefined `alsoConsidering` → `null`.
  - defensive filter: an extra equal to the primary, and a duplicate extra, are dropped before scoring (assert `items.length`).
  - each extra's band === `runAssessment({ ...profile, fieldOfStudy: extra }).verdict` (pick a fixture where primary and extra land in **different** bands — use `FIELD_COMPETITIVENESS` spread: e.g. primary `computer-science` vs extra `business` on a mid-GPA profile).
  - `outranksPrimary` true only when strictly stronger band (rank via `VERDICTS` index, lower better); order preserved.
  - **common case:** two extras, neither outranking → `items` length 2, `pivot === null`.
  - `pivot` = strongest outranking field; `null` when none; ties → first in student order.
  - **boundary-straddle:** primary & extra just either side of a cutoff → band differs, type still carries only `.verdict`.
  - **no-leak:** the returned `SecondaryVerdict` object has no `weighted` / `dimensions` / `computedAt` keys (`expect(Object.keys(item)).toEqual(["field","label","verdict","outranksPrimary"])`).
- [ ] **Step 2: Run, verify fail** — `npm test -- secondary-verdicts` → FAIL (module missing).
- [ ] **Step 3: Implement** per spec: filter+dedupe+exclude primary first (return `null` if empty); for each remaining field `runAssessment({ ...profile, fieldOfStudy: field })`, keep only `.verdict`; compute `outranksPrimary` via `VERDICTS` index; `pivot` = best-ranked outranking field (ties → first). Import `runAssessment` from `@/lib/scoring/engine`, `VERDICTS`/`Verdict`/`FieldOfStudy` from `@/lib/scoring/types`, `FIELD_LABELS` from `@/lib/labels`, `AssessmentResult` type as needed.
- [ ] **Step 4: Run, verify pass** — `npm test -- secondary-verdicts` → PASS.
- [ ] **Step 5: Commit** — `feat(mv-102): add computeSecondaryVerdicts pure module`.

---

## Task 4: Payload type + assembly wiring

**Files:**
- Modify: `lib/results/types.ts` (add `secondaryVerdicts?: SecondaryVerdicts | null` to `AssessmentPayload`; import the type)
- Modify: `lib/results/assemble.ts` (hoist `const result = runAssessment(scored)`, attach `secondaryVerdicts: computeSecondaryVerdicts(scored, result)`)
- Test: `tests/results/assemble.test.ts` (new assertions — NOT characterization) and `tests/scoring/characterization.test.ts` (one null assertion)

Spec: "Assembly" (lines 101-113), "Payload type" (128-134), rev-3 build detail (line 308).

- [ ] **Step 1: Write failing tests** —
  - In `assemble.test.ts`: a single-field profile → `payload.secondaryVerdicts === null`. A profile with a primary + one easier also-considering field → `payload.secondaryVerdicts.items` length 1 with the expected band; primary `payload.result.verdict` unchanged vs the single-field run.
  - In `characterization.test.ts`: assert a representative single-field golden payload has `secondaryVerdicts === null` (goldens themselves stay byte-identical — do not add `alsoConsidering` to any golden fixture).
- [ ] **Step 2: Run, verify fail** — `npm test -- assemble` → FAIL (key absent).
- [ ] **Step 3: Implement** — hoist the inline `runAssessment(scored)` to `const result`; keep `result` in the return literal; add `secondaryVerdicts: computeSecondaryVerdicts(scored, result)`. Add the optional key to `AssessmentPayload`.
- [ ] **Step 4: Run, verify pass** — `npm test -- assemble` and `npm test -- characterization` → PASS.
- [ ] **Step 5: Commit** — `feat(mv-102): attach secondaryVerdicts to assessment payload`.

---

## Task 5: Presentational `<SecondaryVerdicts>` component

**Files:**
- Create: `components/results/secondary-verdicts.tsx`
- Test: `tests/components/results/secondary-verdicts.test.tsx`

Spec: "Display" (lines 136-162) + rev-3 build detail (`role="note"`, non-colour-reliant, line 311). Prop: `{ data: SecondaryVerdicts | null | undefined }`.

- [ ] **Step 1: Write failing tests** (RTL) —
  - `null` / `undefined` / empty `items` → renders nothing (`container.firstChild === null` or `queryBy...` null).
  - populated → one row per item; each row text contains the conditional framing `If you applied under {label} instead` **and** the `VERDICT_LABELS[verdict].label` word; pill carries the right verdict colour class (`bg-strong-tint`/`bg-possible-tint`/`bg-reach-tint`).
  - pills render **without** `animate-rise`/`animate-settle` classes (assert absence).
  - `pivot` set → a callout with `role="note"` naming the stronger band; the meaning is carried by the word (assert the band word present in the callout text, not only a class).
  - `pivot` null → no `role="note"` callout.
- [ ] **Step 2: Run, verify fail** — `npm test -- components/results/secondary-verdicts` → FAIL (component missing).
- [ ] **Step 3: Implement** per spec Display: section label "Your standing if you applied under a different field"; each row "If you applied under {label} instead — {word}" with the tinted pill (reuse the exact colour classes from `verdict-card.tsx` `VERDICT_META`; **static**, no `animate-*`); callout `role="note"` with the band-comparison copy (words only, no "realistic path", no cost/visa implication). Warm-paper surface, thin border, no gradient/shadow, sentence case. Named export.
- [ ] **Step 4: Run, verify pass** — PASS.
- [ ] **Step 5: Commit** — `feat(mv-102): add SecondaryVerdicts results component`.

---

## Task 6: Wire into `<Results>` (swap CompetitivenessNote → SecondaryVerdicts)

**Files:**
- Modify: `components/results/results.tsx` (line ~77: replace `<CompetitivenessNote note={payload.competitivenessNote} />` with `<SecondaryVerdicts data={payload.secondaryVerdicts} />`; update imports)
- Test: `tests/components/results/results.test.tsx` (or wherever `<Results>` is tested)

Spec: "Relationship to competitivenessNote" (174-184) — `field-note.ts` and the payload field are retained, just not rendered here.

- [ ] **Step 1: Write/adjust failing test** — with a payload carrying `secondaryVerdicts`, `<Results>` renders the secondary rows and does **not** render the old competitiveness-note text; the primary `VerdictCard` is untouched (assert its verdict word still present).
- [ ] **Step 2: Run, verify fail**.
- [ ] **Step 3: Implement** the swap. Remove the now-unused `CompetitivenessNote` import from `results.tsx` only (do not delete the component/module — still used/tested elsewhere; if it becomes fully orphaned, note it, don't delete in this slice).
- [ ] **Step 4: Run, verify pass**.
- [ ] **Step 5: Commit** — `feat(mv-102): render secondary verdicts on results in place of competitiveness note`.

---

## Task 7: Matches `field-exploring` label reword (blocker B2)

**Files:**
- Modify: `lib/matches/compute.ts` (~line 177, the `field-exploring` reason `text`)
- Test: `tests/matches/compute.test.ts` (update assertions at ~lines 193, 212)

Spec: "Matches-page label reconciliation" (164-172) + rev-3 build detail (lines 306-307).

- [ ] **Step 1: Update the failing test** — change the two assertions currently matching `/not covered by your verdict/i` to the new wording, and add one asserting the text does **not** contain "not covered by your verdict".
- [ ] **Step 2: Run, verify fail** — `npm test -- matches/compute` → FAIL (old string still emitted).
- [ ] **Step 3: Implement** — reword the reason text to `"In a field you're also considering — not your primary field."`.
- [ ] **Step 4: Run, verify pass**.
- [ ] **Step 5: Commit** — `fix(mv-102): reconcile matches exploring-label with per-field verdicts`.

---

## Task 8: M1 — editor always sends `alsoConsidering` (clears stale extras)

**Files:**
- Modify: `components/profile/editors/study-career-editor.tsx` (~line 80: always include `alsoConsidering`, empty array when none)
- Test: the editor's existing test file (find via the editor's test co-location), or `tests/components/profile/...`

Spec: rev-3 M1 (lines 280-287). `lib/profiles/repo.ts:56` shallow-merges, so an omitted key never clears — the fix is at the editor boundary; `repo.ts` is **not** edited.

- [ ] **Step 1: Write failing test** — simulate the editor saving intended-study after removing all extras: assert the patch sent to the save handler includes `alsoConsidering: []` (not omitted). If a unit test of the editor's patch-builder is impractical, extract the patch assembly into a tiny pure helper and test that.
- [ ] **Step 2: Run, verify fail**.
- [ ] **Step 3: Implement** — always spread `alsoConsidering` (defaulting to `[]`) into the intended-study patch.
- [ ] **Step 4: Run, verify pass**.
- [ ] **Step 5: Commit** — `fix(mv-102): always send alsoConsidering so cleared extras persist`.

---

## Task 9: M2 — AI guide context carries secondary bands

**Files:**
- Modify: `lib/guide/context.ts` (`buildGuideContext`, ~line 91)
- Test: `tests/guide/context.test.ts` (or wherever `buildGuideContext` is tested)

Spec: rev-3 M2 (lines 289-293). Field-label + band-**word** only, no raw scores.

- [ ] **Step 1: Write failing test** — given a payload with `secondaryVerdicts`, `buildGuideContext(payload, ...)` output contains each field **label** and its band **word** and **no numeric score**.
- [ ] **Step 2: Run, verify fail**.
- [ ] **Step 3: Implement** — append a compact secondary-verdicts section to the context string using `FIELD_LABELS` + `VERDICT_LABELS` words only. Guard for `null`/absent.
- [ ] **Step 4: Run, verify pass**.
- [ ] **Step 5: Commit** — `feat(mv-102): ground AI guide in secondary field verdicts`.

---

## Task 10: Board reconciliation + full gate + final verification

**Files:**
- Modify: `docs/kanban/board.json` (this branch), then `npm run board`

- [ ] **Step 1: Reconcile board** — in `board.json`, flip cards from `inreview` → `done` **only for ids actually present and inreview**: MV-80, MV-99, MV-101, and MV-100 if it has a board entry. Set MV-102's own `col` to `inreview` with today's `entered`. Run `npm run board` to regenerate `board.md` + `board.html`.
- [ ] **Step 2: Full gate** — `npm run typecheck && npm run lint && npm test`. All green (note: the CI `integration` job is expected red on secrets — not a code blocker; and the 1-July MV-80 freshness timer may show 1 pre-existing failure unrelated to this slice — confirm it is the same failure that exists on `origin/master`, don't fix it here).
- [ ] **Step 3: Confirm goldens byte-identical** — `git diff origin/master -- tests/scoring/characterization.test.ts` shows only the added `secondaryVerdicts === null` assertion, no golden value changes.
- [ ] **Step 4: Commit** — `chore(mv-102): reconcile board + regenerate views`.
- [ ] **Step 5: Push branch** — `git push -u origin mv-102-per-field-verdicts`. **Do not open the PR or merge yet** — report back for the founder-gated PR/merge step.

---

## Self-review notes

- **Spec coverage:** Tasks 1-9 cover every "Files → Edit/New" entry and every "Testing" bullet in the spec; Task 10 covers Bookkeeping. The retained `field-note.ts`/`competitivenessNote` is intentionally untouched (Task 6 only removes its results render).
- **Type consistency:** `SecondaryVerdict`/`SecondaryVerdicts` defined in Task 3 are the exact types imported in Tasks 4 (payload) and 5 (component). `computeSecondaryVerdicts(profile, primaryResult)` signature is identical across Tasks 3 and 4.
- **Out of scope (do not build):** anon expiry-copy bug (`conversion-paths.tsx`) — separate task chip; catalogue `Program.field` string-match looseness — informational only.
