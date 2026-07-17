# MV-126 — Overhaul Phase 2 / guide shell restyle (non-mascot)

> **Renumbered MV-100 → MV-126 on 2026-07-17 (MV-123).** This card was filed under the
> elevated-calm *spec's* numbering (spec MV-100 = Guide), which collided with the
> 2026-07-04 card MV-100 (matches progressive disclosure). That collision deleted the
> other card from the board outright during a board.json union: it stayed merged in
> master while the board forgot it existed. Restored as [MV-100](MV-100-matches-progressive-disclosure.md).
> This card's branch, commits and PR still say `mv-100` / MV-100.

**Column:** In review · **Priority:** P2 · **Owner:** agent · **Created:** 2026-07-07
**Branch:** `mv-100-guide-restyle` — **stacked off #67** (`mv-99-profile-restyle`),
which carries #62 (MV-106 type) + #63 (MV-107 motion) + #64 (MV-108 landing) +
#65 (MV-109 auth) + #66 (MV-110 dashboard) + #67 (MV-99 profile). **7-deep stack**;
rebase `--onto master` once that chain merges → clean guide-only diff.
**PR base = `mv-99-profile-restyle`** so the PR diff is already guide-only.
**Applies:** the elevated-calm overhaul spec `docs/design/2026-07-03-elevated-calm-overhaul-spec.md`
**MV-100 (Guide)** — the **non-mascot** portion, Phase-2 continuation after the profile slice.

## Scope — what MV-100 actually needed

Spec line 63: *"Corridor-mascot head-mark avatar (24/32) on assistant messages;
message entrance fades; calm typing indicator (mono ellipsis, no bouncing dots);
503 state gets sheltering pose."* Two of the four items are **mascot** and
**Gate-G-blocked** (see Deferred). A 2026-07-07 ground-truth pass on the two
**non-mascot** items found:

- **Message entrance fades** — NOT shipped. The message `<li>` bubbles
  (`guide-chat.tsx:68-75`) carried no entrance animation. **Built now.**
- **Calm typing indicator** — **already calm and non-bouncing** (`guide-chat.tsx:83`
  was a plain `<span>The guide is thinking…</span>` — no bouncing dots, no
  `@keyframes bounce`, no `animate-bounce`, no raw `duration-N`). The only gap vs the
  spec's *"mono ellipsis"* wording was that it wasn't rendered in IBM Plex Mono.

## What changed (presentational only — no data/logic/streaming touched)

- `components/guide/guide-chat.tsx` (2 class-level edits, both inside the existing
  `cn()` calls):
  - **Message bubbles** — prepended `animate-fade` (tokenised opacity entrance) to the
    message `<li>` className. Each `<li>` mounts independently, so this is one reveal
    per bubble — **NO per-child `animationDelay` stagger** (the global reduced-motion
    guard zeroes `animation-duration` but not `-delay`, so a raw stagger would flash).
  - **Typing indicator** — `text-small text-ink-faint` → `font-mono text-small
    text-ink-faint` so "The guide is thinking…" renders in IBM Plex Mono, meeting the
    spec's "mono ellipsis" letter. No forbidden motion existed to remove.

`"use client"` was already present (not added). The DeepSeek fetch, 503/`ERROR_MSG`
handling, message state, and Zod are all untouched.

## Deferred (Gate-G-blocked — founder-owned, NOT built)

- **Corridor-mascot head-mark avatar (24/32)** on assistant messages.
- **503 state sheltering pose.**

Both depend on the undelivered mascot brief (**MV-85 ✋**) + imagery-policy amendment
(**MV-86 ✋**) + hand-traced SVGs. They unblock with the mascot tail; this slice ships
the motion/token half now, consistent with the dashboard/profile slices.

## Flagged (judgment call — founder is visual/copy-sensitive)

- **`font-mono` on the typing indicator** — the indicator was *already* calm and
  non-bouncing, so the only thing left to satisfy the spec's exact "mono ellipsis"
  wording was the mono face. Added `font-mono`; the copy ("The guide is thinking…")
  is unchanged. If you'd rather leave the indicator byte-identical (treating
  "already non-bouncing" as done and the mono styling as optional), it's a one-class
  revert.

## Tests (TDD)

- `tests/components/guide/guide-chat.test.tsx` — **+2 tests**:
  - message bubbles (both the student question and the grounded reply) carry
    `animate-fade`, with guards `not.toMatch(/animate-bounce|animate-ping|animate-pulse/)`
    and `not.toMatch(/duration-\d/)`.
  - the in-flight typing indicator carries `font-mono` and none of the forbidden
    bounce/pulse/raw-duration classes.

## Evidence — GREEN gate on `mv-100-guide-restyle`

- `tsc --noEmit` — 0 errors.
- `eslint` — 0 errors (pre-existing `docs/kanban/build.mjs` unused-var warning only).
- **full suite — 278 files / 1771 passed, 0 failed** (was 278/1769; +2 test guards);
  style ratchets (type-scale, motion-tokens, card-shell) all green.
- Not browser-verified: the guide is behind auth + returns a calm 503 until a valid
  `DEEPSEEK_API_KEY` is set, so a class-level presentational restyle is verified via
  the suite + ratchets, consistent with prior auth-gated slices. Best eyeballed on the
  Vercel preview once signed in (light/dark, reduced-motion on/off).

## Ship

**SHIPPED 2026-07-07 → PR (stacked, base=#67), founder-gated merge (never self-merged).**

## Resume notes (cold start)

Guide restyle done (non-mascot MV-100) — message-entrance `animate-fade` + `font-mono`
typing indicator; the typing indicator was already calm/non-bouncing. **Stacked 7-deep**
(#62→#63→#64→#65→#66→#67→this); after the founder merges that chain, rebase `--onto
master`. Remaining Phase-2 non-mascot: **MV-101 chrome/cleanup** (`components/**` chrome,
mobile-tab-bar active transitions, delete unused `public/*.svg`, optional
`opengraph-image.tsx`) — the LAST non-mascot Phase-2 slice. Mascot tail stays
Gate-G-blocked (MV-85 ✋ + MV-86 ✋ + SVGs); the two deferred MV-100 mascot pieces
(head-mark avatar + 503 sheltering pose) join that tail.
