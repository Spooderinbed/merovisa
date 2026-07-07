# MV-109 — Overhaul Wave A / A4: auth non-mascot restyle

**Column:** In review · **Priority:** P2 · **Owner:** agent · **Created:** 2026-07-07
**Branch:** `mv-109-auth-restyle` — **stacked** on the A1 + A2 token branches and A3,
created off `mv-108-landing-restyle` (PR #64), which already carries BOTH the A1
`text-*` type tokens and the A2 `duration-*` / `animate-*` motion tokens (plus the
A3 landing changes). PRs #62 (MV-106) + #63 (MV-107) + #64 (MV-108) were all still
open when this was built, so it stacks; once the founder merges that chain to
master, rebase `--onto master` and the token + landing diff drops away, leaving an
auth-only review.
**Applies:** the elevated-calm overhaul spec `docs/design/2026-07-03-elevated-calm-overhaul-spec.md`
**MV-95 (Auth)** — the **non-mascot** portion. Wave A step 4, after A1 (MV-106 type
scale) + A2 (MV-107 motion tokens) + A3 (MV-108 landing).

## Scope — the non-mascot half of MV-95

MV-95's spec line asks for: Card primitive, type scale, a **160px NEUTRAL mascot
welcome mark** above the Google CTA, honest email fallback preserved, entrance
rise. The **160px mascot mark is BLOCKED on Gate G** (MV-85 mascot brief ✋ + MV-86
imagery-policy ✋ + hand-traced SVGs) — **left untouched**: the existing neutral
44px plum diploma mark stands. Everything else MV-95 asks for is already true or
shipped here:

- **Card primitive — already satisfied.** `auth-card.tsx` already wraps the sign-in
  block in `<Card padding="lg">`; `Card` defaults to `radius="panel"` (16px), the
  correct panel radius. No change needed.
- **Type scale — already satisfied.** The body/label text already uses scale
  tokens (`text-lead` lede, `text-small` privacy line + toggle, `text-meta` email
  fallback). The `<h1>` keeps `text-[clamp(28px,3.4vw,38px)]` — a **hero-size
  display heading**, which is deliberately an arbitrary clamp (identical to the A3
  landing section headings); the 9-step scale tops out at `display 24` and is for
  UI/body text, not hero display type. Forcing the h1 into `text-display` would
  shrink the heading — out of scope and wrong.
- **Honest email fallback — preserved.** The "Other ways to sign in" toggle still
  discloses "Email sign-in isn't ready yet — Google is the only way…"; no fake
  email input / submit masquerading as login. Guarded by an existing test, untouched.

## What changed — the net-new: a two-beat entrance

The only spec item not already met was **entrance rise**. Added the same two-beat
choreography A3 gave the landing hero:

1. `animate-rise` on the header block (mark + h1 + lede) — **beat 1**.
2. `animate-settle` on the `<Card>` sign-in panel — **beat 2**.

**Reduced-motion-safe WITHOUT touching the shared guard.** Both `rise` and `settle`
are keyframe-baked (no raw `animation-delay`); the guard (`app/globals.css`
223–232) zeroes `animation-duration` but NOT `animation-delay`, so a raw per-item
delay stagger would flash — using `settle` (which bakes its hold into keyframe
phases) for beat 2 instead means the whole entrance collapses cleanly to the final
state under `prefers-reduced-motion: reduce`. The Google CTA press
micro-interaction is already served by the `Button` primitive's base recipe
(`transition-[background-color,transform] duration-fast ease-calm
active:translate-y-px`) — no change needed.

**Corridor-neutral brand:** already satisfied — auth is pre-corridor and the mark
uses `bg-primary` (plum = the neutral global brand); corridor accents activate only
post-onboarding (MV-91).

## Files touched

- `components/auth/auth-card.tsx` — `animate-rise` on the header `<div>`,
  `animate-settle` on the `<Card>`. Two classNames; nothing else.

## Tests (TDD)

- `tests/components/auth/auth-card.test.tsx` — **+1** test: asserts the header
  block carries `animate-rise` and the sign-in card carries `animate-settle`
  (with an inline note that both are keyframe-baked / reduced-motion-safe). The
  existing 3 tests (Google CTA + privacy line, OAuth → /auth/callback, honest
  email fallback) are unchanged and still green — the honest-fallback trust
  behaviour is explicitly re-verified.

## Evidence — GREEN gate on `mv-109-auth-restyle`

- `tsc --noEmit` — 0 errors.
- `eslint` — 0 errors (pre-existing `docs/kanban/build.mjs` unused-var warning only).
- **full suite — 277 files / 1759 tests passed, 0 failed** (was 1758; +1 entrance test).

## Ship

**SHIPPED 2026-07-07 → PR (stacked on #62 + #63 + #64), founder-gated merge (never self-merged).**

## Resume notes (cold start)

Wave A step 4 done (non-mascot MV-95). **Stacked on #62/#63/#64** — after the
founder merges those to master, `git fetch` + `git rebase --onto master
<new-master> mv-109-auth-restyle` to shed the token + landing diff → clean
auth-only PR. The **160px mascot welcome mark stays deferred** (Gate G: MV-85 ✋ +
MV-86 ✋ + hand-traced SVGs) — the neutral 44px plum diploma mark stands.
Remaining Wave A: **A5** Phase-2 shell Card/VerdictPill/corridor-accent sweep
(A1's global `cn` fix already makes `text-<token>` + `text-<colour>` safe in one
`cn()`, so the sweep is safe). Then Wave B waits on the mascot SVGs.
