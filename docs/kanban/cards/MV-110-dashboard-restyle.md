# MV-110 — Overhaul Phase 2 / dashboard shell motion restyle

**Priority:** P2 · **Owner:** agent · **Created:** 2026-07-07
**Branch:** `mv-110-dashboard-restyle` — **stacked off #65** (`mv-109-auth-restyle`),
which carries #62 (MV-106 type) + #63 (MV-107 motion) + #64 (MV-108 landing) + A4.
5-deep stack; rebase `--onto master` once that chain merges → clean dashboard-only
diff. **PR base = `mv-109-auth-restyle`** so the PR diff is already dashboard-only.
**Applies:** the elevated-calm overhaul spec `docs/design/2026-07-03-elevated-calm-overhaul-spec.md`
**MV-97 (Dashboard)** — the **non-mascot** portion, Phase-2 kickoff.

## Scope — what MV-97 actually needed

A 2026-07-07 ground-truth pass found most of MV-97's checklist already shipped by
prior slices: all 5 `components/dashboard/*` already adopt `<Card>` (MV-84), use
design tokens + carry zero `text-[Npx]` (MV-106), and `snapshot-card` delegates its
verdict to `VerdictCard` → shared `<VerdictPill>` (MV-89) — no local verdict colours
to replace. `readiness-map` band pills already use tokens (`bg-strong-tint` etc.).
**The genuine delta was the missing motion vocabulary** (spec items 4 + 5): entrance
reveals + calm state transitions. **Mascot nod (milestone beat) + corridor accents
are DEFERRED** (Gate G / separate follow-up) — this is the non-mascot core.

## What changed (presentational only — no data/logic/behavior touched)

- `greeting.tsx` — `animate-rise` on the `<header>` (semantic header, not a Card).
  Hero heading kept `text-[clamp(28px,3.6vw,40px)]` (legit >24px, ratchet-exempt,
  matches the landing/auth h1 pattern).
- `journey-rail.tsx` — `animate-rise` on the `<Card>`; **dot state transitions**
  `transition-[background-color,border-color,box-shadow] duration-medium ease-calm`;
  added the missing `duration-medium` token to the stage `<Link>`'s existing
  `transition-colors ease-calm`.
- `prompt-card.tsx` — `animate-rise` on all four `<Card>` branches (only one mounts
  at a time — a single reveal, not four).
- `readiness-map.tsx` — `animate-rise` on the `<Card>` region.
- `snapshot-card.tsx` — `animate-rise` on both `<Card>` branches (populated + empty).

**Reduced-motion-safe:** one `animate-rise` per card/section root — NO per-child
`animationDelay` stagger (the global guard zeroes `animation-duration` but not
`-delay`, so a raw stagger would flash). Dots/rows keep their own `transition-*`
(state changes, not entrance) → no double-reveal.

## Flagged (no change — founder calls, per the "don't re-tune / don't guess" rule)

- **ReadinessMap band colours** — already tokenised (`bg-strong-tint text-strong`,
  `bg-possible-tint text-possible-ink`, `bg-reach-tint text-reach`, neutral
  `border-line bg-surface text-ink-faint`); no raw/legacy hex in `components/dashboard/`.
  Left untouched.
- **Greeting hero clamp** — kept (>24px, legal; the type ratchet bans only `text-[Npx]`).

## Tests (TDD)

- Extended `greeting` / `prompt-card` / `readiness-map` / `snapshot-card` tests with
  entrance-reveal assertions; all prior behavior/data assertions unchanged + green.
- **NEW** `tests/components/dashboard/journey-rail.test.tsx` (4 tests: labelled region,
  frontier/current-step anchor, entrance reveal, calm dot-transition tokens + a
  raw-duration guard). Dashboard suite: **5 files / 24 tests** (+1 file, +8 net).

## Evidence — GREEN gate on `mv-110-dashboard-restyle`

- `tsc --noEmit` — 0 errors.
- `eslint` — 0 errors (pre-existing `docs/kanban/build.mjs` warning only).
- **full suite — 278 files / 1767 passed, 0 failed** (was 277/1759); all style ratchets
  (type-scale, motion-tokens, card-shell) green.
- Not browser-verified: dashboard is auth-gated (unreachable without a session), so a
  class-level presentational restyle is verified via the suite + ratchets, consistent
  with prior dashboard slices.

## Ship

**SHIPPED 2026-07-07 → PR (stacked, base=#65), founder-gated merge (never self-merged).**

## Resume notes (cold start)

Phase-2 kickoff done (non-mascot MV-97). **Stacked 5-deep** (#62→#63→#64→#65→this);
after the founder merges that chain, rebase `--onto master`. **Mascot milestone-beat
+ corridor accents on the dashboard stay deferred** (Gate G: MV-85 ✋ + MV-86 ✋ + SVGs;
corridor accents = own follow-up). Remaining Phase-2 non-mascot: **MV-99 profile**,
**MV-100 guide**, **MV-101 chrome/cleanup** (all pre-overhaul restyle). Phase-1 funnel
overhaul is complete.
