# MV-99 — Overhaul Phase 2 / profile shell restyle

**Column:** In review · **Priority:** P2 · **Owner:** agent · **Created:** 2026-07-07
**Branch:** `mv-99-profile-restyle` — **stacked off #66** (`mv-110-dashboard-restyle`),
which carries #62 (MV-106 type) + #63 (MV-107 motion) + #64 (MV-108 landing) +
#65 (MV-109 auth) + #66 (MV-110 dashboard). 6-deep stack; rebase `--onto master`
once that chain merges → clean profile-only diff. **PR base = `mv-110-dashboard-restyle`**
so the PR diff is already profile-only.
**Applies:** the elevated-calm overhaul spec `docs/design/2026-07-03-elevated-calm-overhaul-spec.md`
**MV-99 (Profile)** — the **non-mascot** portion, Phase-2 continuation after the dashboard slice.

## Scope — what MV-99 actually needed

Spec line 62: *"CompletenessRing re-tint (keep dashoffset transition); accordion
restyle on disclosure primitive; editors onto type scale."* A 2026-07-07 ground-truth
pass found **all three checklist items already shipped** by prior slices:

- **CompletenessRing** (`completeness-ring.tsx:17`) already uses the design token
  `text-primary` (dusk-plum, MV-84 rebrand) + `transition-[stroke-dashoffset]
  duration-slower ease-calm`. Zero raw hex anywhere in `components/profile/**`.
  Nothing to re-tint; the dashoffset transition is present and tokenised.
- **Accordion** (`section-accordion.tsx`) already folds onto the shared
  `components/ui/disclosure.tsx` primitive (trigger `transition-colors duration-fast
  ease-calm`; chevron `transition-transform duration-medium ease-calm` + `rotate-90`
  on open). The spec's exact "on disclosure primitive" was satisfied by Audit #21.
- **Editors onto type scale** — `text-[` grep across `components/profile/**` returns
  NONE (MV-106 ratchet already cleared every `text-[Npx]`); the repo-wide type-scale
  ratchet passes.

**The genuine delta was entrance-reveal parity with the dashboard slice** (spec
motion items 4+5): the completeness card had no `animate-rise` reveal.

## What changed (presentational only — no data/logic/behavior touched)

- `completeness-ring.tsx` — added `animate-rise` to the `<Card as="aside">` shell
  root (the one stable page-shell root in `components/profile/**` that mounts once on
  navigation), mirroring the dashboard reveal. The `text-primary` tint and the
  dashoffset transition are untouched.

**Reduced-motion-safe:** one `animate-rise` on a single container root — NO per-child
`animationDelay` stagger (the global guard zeroes `animation-duration` but not
`-delay`, so a raw stagger would flash). `SectionAccordion` deliberately did NOT get
`animate-rise` — it renders once per group (13 rows), which would be a multi-sibling
reveal (exactly the stagger the guard warns against).

## Flagged (no change — founder calls / out of scope)

- **Ring `text-primary` tint** — the deliberate dusk-plum design token, already correct;
  not re-tuned.
- **Accordion-list container reveal** — the list `<div>` that would be the second stable
  container lives in `app/(app)/profile/page.tsx`, **outside `components/profile/**`
  scope**, so untouched. If the founder wants the whole list to reveal as a single
  group, that's a one-line `animate-rise` on the list `<div>` in `page.tsx` — flagged
  as a separate, deliberate touch rather than guessed.
- **Shared disclosure primitive** already exists (`components/ui/disclosure.tsx`); no
  new abstraction invented.

## Tests (TDD)

- `completeness-ring.test.tsx` — extended: assert the entrance reveal on the shell root;
  assert the re-tint keeps `text-primary` + `duration-slower` dashoffset transition with
  no raw/arbitrary duration leaked.
- `section-accordion.test.tsx` — **new guard**: the accordion inherits the disclosure
  primitive's tokenised calm chevron transition (`transition-transform duration-medium
  ease-calm`, no raw duration) — keeps the accordion from drifting off the primitive.

## Evidence — GREEN gate on `mv-99-profile-restyle`

- `tsc --noEmit` — 0 errors.
- `eslint` — 0 errors (pre-existing `docs/kanban/build.mjs` warning only).
- **full suite — 278 files / 1769 passed, 0 failed** (was 278/1767); style ratchets
  (type-scale, motion-tokens, card-shell) all green.
- Not browser-verified: profile is auth-gated (server `redirect` to `/auth` without a
  session), so a class-level presentational restyle is verified via the suite + ratchets,
  consistent with the dashboard and prior auth-gated slices.

## Ship

**SHIPPED 2026-07-07 → PR (stacked, base=#66), founder-gated merge (never self-merged).**

## Resume notes (cold start)

Profile restyle done (non-mascot MV-99) — turned out to be entrance-reveal parity only;
the ring/accordion/type-scale were already shipped. **Stacked 6-deep**
(#62→#63→#64→#65→#66→this); after the founder merges that chain, rebase `--onto master`.
Remaining Phase-2 non-mascot: **MV-100 guide** (`components/guide/*`), **MV-101
chrome/cleanup**. Mascot tail stays Gate-G-blocked (MV-85 ✋ + MV-86 ✋ + SVGs).
Deferred one-liner: `animate-rise` on the profile-page accordion-list container in
`app/(app)/profile/page.tsx` (own touch, founder call).
