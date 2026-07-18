# MV-94 — Overhaul Phase 1 (apply): drop the last `transition-all`

**Priority:** P2 · **Owner:** agent · **Created:** 2026-07-04
**Branch:** `mv-94-drop-transition-all` off `origin/master f6cada8`
**Implements:** [Motion v2 ADR](../../design/2026-07-03-motion-v2-adr.md) adoption item 1.

## Why

First apply-slice off the just-locked Motion v2 ADR (MV-93). The ADR's hard rule is
**never `transition-all`** — it animates layout properties implicitly and is
unpredictable; name the properties instead. The audit found exactly **1** site
left: `components/ui/progress-dots.tsx`, where the active-step pill was using
`transition-all` to animate its width grow (`w-1.5` → `w-6`) and colour
(`bg-bg-tint` → `bg-primary`). Uncontroversial and orthogonal to the ADR's open
questions (duration tokens / second easing / slide keyframes), so safe to land
ahead of full ADR sign-off.

## Scope

- **In scope:** replace the single `transition-all` with the explicit prop list
  `transition-[width,background-color]` (matches the codebase's existing arbitrary
  style, e.g. `button.tsx`'s `transition-[background-color,transform]`). Add a
  regression test locking the class (mirrors `completeness-ring.test.tsx`).
- **Out of scope (deliberate):** duration-token migration, second easing, lint
  rule banning `transition-all` — all separate ADR open questions / follow-ons.
  Rendered behaviour is unchanged: the two properties already animated under
  `transition-all`; this only names them (compositor note: width is an intentional
  1.5→6 pill grow, the sanctioned `transition-[width]` pattern also used by
  accuracy-meter / factor-bars, not layout thrash).

## Test plan

TDD, red-first:
1. New test in `tests/components/progress-dots.test.tsx` asserts the dot class
   **contains** `transition-[width,background-color]` and **not** `transition-all`.
   Confirmed RED against the unchanged component.
2. Apply the one-line class change → test GREEN.
3. Gate: typecheck + lint + full suite.

## Evidence

- Change: `components/ui/progress-dots.tsx:21` — `transition-all` →
  `transition-[width,background-color]`.
- Test: `tests/components/progress-dots.test.tsx` +1 (2 total, both green).
- Audit: `grep -rn 'transition-all' --include=*.{tsx,ts,css}` → **0 remaining** in
  `components/` + `app/` after the change (was the last site).
- Gate: `tsc --noEmit` exit 0 · `npm run lint` 0 errors (1 pre-existing warning,
  `docs/kanban/build.mjs`) · full suite green apart from the 1 pre-existing red
  (MV-80 FY2026-27 freshness timer, deferred/blocked) — see Ship for the count.

## Ship

**SHIPPED 2026-07-04 → PR [#49](https://github.com/Spooderinbed/merovisa/pull/49)**
(branch `mv-94-drop-transition-all` off `origin/master f6cada8`). In Review,
founder-gated merge (never self-merged). Independent slice; board off origin/master
tops out at MV-89 and 90–93 are claimed by in-flight branches, so this took MV-94.

## Resume notes (cold start)

Done — the last `transition-all` is gone and the codebase is now clean of it.
Remaining Motion v2 follow-ons (separate, founder-gated, tied to ADR open
questions): (2) `--dur-*` duration tokens if Q1=yes; (3) fold the vocabulary into
the overhaul spec's motion section; (4) add a lint/review note banning
`transition-all` + JS animation deps so this can't regress.
