# MV-103 — Persistent "where am I" journey marker (MV-45 #3b)

**Priority:** P2 · **Owner:** agent · **Branch:** `mv-103-journey-marker` (off `origin/master`)

## Why

A signed-in student should always know **where they are** on the six-step path
(Assess → Profile → Matches → Plan → Documents → Apply). MV-77 shipped that rail as a
**dashboard panel** — but the orientation vanishes the moment the student navigates to
`/matches`, `/plan`, or `/documents`, which is exactly where "what do I do next?" bites and
nudges them toward a consultancy. This is the second half of the
`2026-06-28-global-journey-rail-design.md` spec (Part 1 = the dashboard rail, already
shipped as MV-77): a **slim persistent marker in the signed-in chrome**.

Note: the spec was filed on a local-only branch under the already-taken id "MV-74"
(board's MV-74 = an unrelated "Dashboard readiness map"). This card gives the remaining
work a clean id and reconciles the spec to what MV-77 actually shipped.

## What shipped

- **`lib/journey/signals.ts`** — `getJourneySignals(supabase, userId)`: reuses the exact six
  repos the dashboard reads and folds them through the **same** `deriveJourneySignals` rules,
  so the marker and the dashboard rail can never disagree and the trust predicates (plan
  "engaged", visa "granted") stay in one place. Parallel reads; caller-wrapped so failure
  degrades to no marker.
- **`components/journey/journey-marker.tsx`** (client) — the slim strip: a mini six-dot rail +
  `{current label} · step N of 6` + chevron, wrapped in one link to `/dashboard`. Reuses
  `buildJourney` verbatim and the **shipped `strong`-token dot vocabulary** (reconciled from
  the spec's older teal). Returns `null` on `/dashboard` (via `usePathname`) where the rich
  rail already lives. Dots hide below `md`; the text (the progress the tab bar lacks) carries.
- **`app/(app)/layout.tsx`** — loads signals in a `try/catch` (wayfinding is non-critical: a
  signals failure → no marker, never a broken page), builds the journey, renders
  `{journey && <JourneyMarker journey={journey} />}` directly under the AppBar.

## Honesty guardrails (from the spec, verified)

- No step lights without its real signal — `buildJourney`/`deriveJourneySignals` reused as-is.
- No invented order — "first incomplete = current"; skip-ahead never fabricates a `done`.
- Never reach-red — this rail is wayfinding, not a verdict (test-guarded).

## Acceptance criteria

- [x] Persistent marker on every signed-in page **except** `/dashboard`.
- [x] Current step + "step N of 6" derived only from real `buildJourney` state.
- [x] Marker and dashboard rail always agree (shared derivation).
- [x] Signals failure degrades to no marker, page still renders.
- [x] Accessible: link name exposes the journey summary + step count; dots `aria-hidden`.

## Test plan / evidence

- `tests/components/journey/journey-marker.test.tsx` (+6): href → `/dashboard`; current step +
  "step N of 6" for fresh and advanced signals; honest accessible name; `null` on `/dashboard`;
  no reach tone; dots `hidden md:flex`.
- `tests/app/app-layout.test.tsx` (+2): marker mounts in chrome; **degrades to no marker when
  `getJourneySignals` rejects** (page + chrome still render). Existing 4 layout tests untouched
  and still green.
- **Gate green:** `npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing
  `build.mjs` warning) · `npx vitest run` **273 files / 1744 tests** (was 271 files / 1736).
- No scorer / DB / migration touched; no golden surface touched.

## Founder-owed / notes

- Merge to master is founder-gated → PR opened, merge left to founder.
- **Visual spacing (dot size, strip height/insets) is a blind call** — the signed-in shell is
  auth-gated, so it can't be browser-verified headlessly. Tokens/sizes mirror the shipped
  MV-77 rail and MV-73 outcome rail for family consistency; a founder eyes-on pass on a real
  session is the right check.
- Future optimisation (out of scope, noted in `signals.ts`): swap the six repo reads for
  count/exists queries. Not needed at MVP traffic; consistency-by-reuse chosen instead.
