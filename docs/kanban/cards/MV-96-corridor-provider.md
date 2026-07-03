# MV-96 — Overhaul Phase 1: corridor theme provider (np-au, expansion-ready)

**Column:** In review · **Priority:** P2 · **Owner:** agent · **Created:** 2026-07-04
**Branch:** `mv-96-corridor-provider` off `origin/master f6cada8`
**Carves:** overhaul spec's Phase-1 "MV-91 — Corridor theme provider" (the personalization architecture). The LAST Phase-1 slice not gated on the type-scale ADR (PR #47), Motion v2 ADR (PR #48), or the mascot (MV-85 ✋).

## Why

Locked founder decision #5: the base brand is **globally neutral** ("we could be
from anywhere"); corridor theming (Nepal → Australia today, other corridors
later) is a **post-onboarding personalization layer** — a few accent tokens + a
mascot plumage variant, activated only once the home country is known. This
slice ships the architecture that every later corridor consumer rides:
spec-MV-94 results accents (Phase 1) and all of Phase 2's signed-in surfaces.

Zero visual change today: `--accent`/`--accent-tint` have **no component
consumers yet** (grep-verified), so the override block is pure plumbing —
which is exactly why it can land ahead of the ADR sign-offs.

## What (mechanic)

- **`lib/theme/corridor.ts`** (new): `CorridorId`/`CorridorTheme` registry
  (np-au → label + `mascotVariant: "danphe"`), `corridorForHomeCountry()`
  (case/whitespace-insensitive "nepal" → `"np-au"`, else null = neutral),
  `DEFAULT_CORRIDOR` for the signed-in MVP.
- **`app/globals.css`**: `[data-corridor="np-au"]` + `[data-theme="dark"]
  [data-corridor="np-au"]` blocks overriding ONLY `--accent`/`--accent-tint`.
  Values = **danphe teal-blue** (Himalayan monal): light `#15687a`/`#15687a18`,
  dark `#7cc4d4`/`#7cc4d422` (dark lifted the same way primary is). Token
  NAMES unchanged; base 23-token blocks untouched (token-contrast guard still
  green).
- **`components/assess/assess-flow.tsx`**: the results phase wraps `<Results/>`
  in `<div className="contents" data-corridor={…}>` resolved from
  `profile.homeCountry` — anonymous activation point (results onward), covers
  owned mode too. `contents` = token carrier, no layout box. Unknown home
  country → no attribute (neutral).
- **`app/(app)/layout.tsx`**: signed-in shell (chrome included, for Phase 2)
  wrapped in the same carrier with `DEFAULT_CORRIDOR` — MVP pins Nepal →
  Australia, the SAME assumption `lib/scoring/from-sections.ts:42` already
  hardcodes for scoring; when home country becomes a real profile field, both
  migrate together. No DB read added to the layout.

Server-safe/no-flash by construction: attributes render from known state
(server component for the shell; first client render from persisted results for
anon restore) — no pre-hydration script needed, unlike `data-theme`.

## Test plan (TDD, red-first — 5 red across 4 files, then green)

1. `tests/theme/corridor.test.ts` (+3): registry resolution, case-insensitive,
   unknown → null, danphe variant registered.
2. `tests/styles/corridor-tokens.test.ts` (+4): corridor blocks override ONLY
   accent tokens (base-palette-untouched invariant); WCAG AA proved light+dark
   with the token-contrast math (accent on bg/surface ≥4.5, ink over tint ≥4.5,
   accent on own tint ≥4.5 — measured 5.47–13.2); **no marketing source
   references `data-corridor`** (recursive scan of `app/(marketing)` +
   `components/marketing`).
3. `tests/assess/assess-flow-corridor.test.tsx` (+3): wizard phase corridor-free;
   results wrapped in np-au for Nepal; corridor-free results for an unknown
   home country.
4. `tests/app/app-layout.test.tsx` (+1): signed-in shell carries np-au, chrome +
   main inside the scope, carrier is `contents`.

## Evidence

- RED: 5 failed / 6 passed across the 4 files before implementation.
- GREEN: 33/33 across the 4 files + all pre-existing style guards
  (token-contrast 23-token frozen-names invariant intact, globals-layering,
  brand-surfaces, a11y) + untouched assess-flow-id/recovery tests.
- Gate: `tsc --noEmit` 0 errors · lint 0 errors (pre-existing build.mjs warning
  only) · full suite — see Ship.

## Blind-call flags (for founder review)

- **Accent hue = danphe teal-blue** (`#15687a`/`#7cc4d4`) — my call, flagged:
  the danphe's iridescent blue-teal, deliberately bluer than verdict-green
  `#1f6d4a` to protect verdict semantics, and chromatically far from plum.
  WCAG-proved at AA text level both themes, so any consumer use is safe. Nothing
  consumes it yet — retuning later is a 2-line values swap (the corridor guard
  re-proves contrast automatically).
- Registry omits the spec's "copy nods" field — nothing consumes copy nods yet
  (simplicity first); add the field with its first consumer.

## Ship

**SHIPPED 2026-07-04 → PR [#51](https://github.com/Spooderinbed/merovisa/pull/51)** (branch
`mv-96-corridor-provider` off `origin/master f6cada8`). In Review, founder-gated
merge (never self-merged).
Disjoint from the 6 other in-flight overhaul branches except `board.json`
(append-at-end, trivially unioned at merge like prior stacks).

## Resume notes (cold start)

The corridor architecture is live but invisible (no accent consumers). First
consumers: spec-MV-94 results restyle (corridor accents + copy nods on results,
mascot still banned there) and Phase-2 shell slices; the mascot component
(spec-MV-96 card) resolves its `variant` from this registry. Do NOT add corridor
iconography to marketing — guarded by tests/styles/corridor-tokens.test.ts.
