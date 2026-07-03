# MV-88 — Overhaul Phase 0c (doc): type-scale ADR

**Column:** In review · **Priority:** P1 · **Owner:** agent · **Created:** 2026-07-03
**Branch:** `mv-88-type-scale-adr` off `origin/master f6cada8`
**Deliverable:** `docs/design/2026-07-03-type-scale-adr.md`

## Why

The primitive-completion arc (MV-90 Card/VerdictPill, MV-91 Button, MV-92
Input/Select) is done — but every primitive, like the ~200 components before it,
hard-codes its font size as a Tailwind arbitrary value (`text-[16px]` etc.). An
audit found **273 `text-[Npx]` occurrences across 15 distinct sizes (10→26px)**
with no single source of truth. The overhaul cannot evolve type without a
tree-wide find-and-replace, and nothing prevents the 274th arbitrary value.

## Scope (carved from the over-broad filing)

MV-88 was filed as a bundle — type scale **+** Motion v2 **+** primitive contracts
**+** the CSS-first/no-framer call. Per simplicity-first this slice is **the type
scale only**; the other three remain their own future ADRs. Deliverable is a
**standalone decision doc** (foldable into the overhaul spec on sign-off), not a
code change.

- **In scope:** record the decision — a named 9-step `--text-*` scale, the exact
  snap map from all 15 current sizes, alternatives considered, open questions, and
  the migration plan.
- **Out of scope (deliberate):**
  - **Applying** the scale (adding the `@theme` block; renaming 273 sites) — a
    separate founder-gated slice. This ADR is decision-only, zero code touched, so
    it carries **no regression risk**.
  - **Motion v2**, **primitive contracts**, **no-framer-motion** — separate ADRs.
  - **Line-height** — v1 leaves `leading-*` per-site untouched (no rhythm shift).

## Decision recorded

9 tokens anchored to the app's high-frequency sizes, so migration is ~90% a 1:1
rename (only 27 sites shift, each ≤2px):

`caption 11 · small 13 · meta 14 · body 15 · control 16 · lead 17 · title 20 · headline 21 · display 24`

Chosen (Option A, faithful) over B (disciplined 6-step, more churn), C (lint
allow-list, blesses sprawl), D (Tailwind defaults, wrong anchors). Three open
questions left for founder sign-off (20/21 merge; adopt B instead?; line-height).

## Test plan

Doc-only slice — no tests. Safety = **zero source/test files touched** (only the
new ADR + kanban card + board), so the suite is unaffected. Gate proves no code
regression via typecheck + lint.

## Evidence

- Deliverable: `docs/design/2026-07-03-type-scale-adr.md` — full ADR (Context /
  Decision / Consequences / Alternatives A–D / Open questions / Migration plan),
  grounded in the 2026-07-03 audit (273 occurrences, 15 sizes → 9 tokens, exact
  per-value frequency + snap deltas).
- Audit method: `grep -rohE 'text-\[[0-9]+px\]' components app | sort | uniq -c` —
  numbers in the ADR are transcribed from that tally (combined
  components + app: 15px×77, 14px×37, 13px×37, 17px×30, … 26px×1).
- Scope note: MV-88 rescoped from the bundled "design-system v2" filing to
  type-scale-only; Motion v2 + primitive-contracts + no-framer deferred to their
  own future cards.
- Gate: `tsc --noEmit` exit 0 · `npm run lint` 0 errors (1 pre-existing warning,
  `docs/kanban/build.mjs`) · no source files changed → suite unaffected
  (baseline 1 pre-existing red = MV-80 freshness timer).

## Ship

**SHIPPED 2026-07-03 → PR [#47](https://github.com/Spooderinbed/merovisa/pull/47)** (branch `mv-88-type-scale-adr` off
`origin/master f6cada8`). In Review, founder-gated merge + ADR sign-off (never
self-merged). Independent doc slice — no overlap with any open code PR.

## Resume notes (cold start)

Decision-only ADR; the deliverable IS the doc. If applying later (separate slice):
add the `@theme --text-*` block from the ADR to `app/globals.css`, then rename
`text-[Npx]` → `text-<token>` per the ADR snap map (1:1 for 246 sites, ≤2px for
27), update the 3 primitives, add a `no-arbitrary-text-size` lint rule, byte-check
goldens, founder visual pass on auth-gated screens.
