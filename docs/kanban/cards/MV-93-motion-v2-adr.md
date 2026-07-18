# MV-93 — Overhaul Phase 0c (doc): Motion v2 ADR

**Priority:** P1 · **Owner:** agent · **Created:** 2026-07-03
**Branch:** `mv-93-motion-v2-adr` off `origin/master f6cada8`
**Deliverable:** `docs/design/2026-07-03-motion-v2-adr.md`

## Why

The second of the two decision docs the overhaul needs locked before Phase-2
build (companion to the MV-88 type-scale ADR). The app has a coherent CSS motion
system but **no written contract** — nothing stops a future PR from pulling in
`framer-motion` (~30KB+ gzipped) onto a low-end-Android funnel, `transition-all`
is already creeping in (1 site), durations are magic numbers, and the clever
reduced-motion `settle` pattern is undocumented.

## Scope

Third slice carved from the over-broad MV-88 "design-system v2" bundle (after the
type scale = MV-88). This slice = **the motion system only**. Standalone decision
doc, foldable into the overhaul spec on sign-off.

- **In scope:** record the decision — CSS-first / no-framer (with a narrow Phase-2
  escape hatch), the two motion classes + hard rules (compositor-only movement,
  paint-only state transitions, never `transition-all`, one easing, never bypass
  reduced-motion), the sanctioned vocabulary (ease-calm + fade/rise/settle +
  pulse), and the stagger convention (≤5 siblings / 40–60ms / ≤700ms).
- **Out of scope (deliberate):**
  - **Applying** any of it (removing the 1 `transition-all`; optional `--dur-*`
    tokens) — separate founder-gated slices. Decision-only, zero code touched → no
    regression risk.
  - Primitive contracts (Card/VerdictPill/Button) — already shipped as MV-90/91/92.

## Test plan

Doc-only slice — no tests. Safety = zero source/test files touched (only the new
ADR + kanban card + board), suite unaffected. Gate = typecheck + lint green.

## Decision recorded

- **CSS-first**, no runtime animation library; narrow escape hatch = a single
  tree-shaken micro-primitive for one Phase-2 surface only, if ever.
- **Movement** animates only `opacity`+`transform`; **state** only paint props.
  **Never `transition-all`.** One easing (`--ease-calm`). Never bypass the
  reduced-motion guard; bake delays into keyframe phases (the `settle` trick).
- Vocabulary = `ease-calm` + `fade`/`rise`/`settle` + `animate-pulse` (skeletons).
- Stagger = ≤5 siblings, 40–60ms, nothing after ~700ms.
- 3 open questions for sign-off (duration tokens?; a second easing?; pre-define
  `slide-*` keyframes?).

## Evidence

- Deliverable: `docs/design/2026-07-03-motion-v2-adr.md` (Context / Decision /
  Consequences / Alternatives A–C / Open questions / Adoption plan).
- Audit method: `grep -rohE '(transition[^ ]*|duration-[0-9]+|ease-[a-z]+|animate-[a-z-]+)' components app | sort | uniq -c`
  (ease-calm ×24, transition-colors ×14, animate-pulse ×14, duration-150 ×9,
  transition-all ×1, …) + read of `app/globals.css` @theme motion tokens +
  keyframes; `grep framer package.json` → none.
- Gate: `tsc --noEmit` exit 0 · `npm run lint` 0 errors (1 pre-existing warning,
  `docs/kanban/build.mjs`) · no source files changed → suite unaffected (baseline
  1 pre-existing red = MV-80 freshness timer).

## Ship

**SHIPPED 2026-07-03 → PR [#48](https://github.com/Spooderinbed/merovisa/pull/48)** (branch `mv-93-motion-v2-adr` off
`origin/master f6cada8`). In Review, founder-gated merge + ADR sign-off (never
self-merged). Independent doc slice; ID MV-93 chosen because 90/91/92 are claimed
by in-flight branches (this branch's board tops out at MV-89).

## Resume notes (cold start)

Decision-only ADR; the doc IS the deliverable. If applying later (separate
slices): (1) replace the 1 `transition-all` with an explicit prop list; (2) if the
founder wants duration tokens, add `--dur-1/2/3` to `@theme` and migrate raw
`duration-N`; (3) fold the vocabulary into the overhaul spec's motion section; (4)
add a review/lint note banning `transition-all` + JS animation deps.
