# MV-107 — Overhaul Wave A / A2: motion duration tokens + fence the ban rules

**Column:** In review · **Priority:** P2 · **Owner:** agent · **Created:** 2026-07-07
**Branch:** `mv-107-motion-duration-tokens` off `origin/master 92a5c77`
**Applies:** `docs/design/2026-07-03-motion-v2-adr.md` — resolves the ADR's
**open question 1** (tokenise durations = yes) and lands adoption items **1**
(`transition-all` fenced) and **4** (JS-animation-library ban). Wave A step 2 of
the elevated-calm overhaul, following A1 (MV-106, type scale).

## Why

The Motion v2 ADR mapped four unresolved motion smells. A2 closes three of them:

1. **Durations were magic numbers** — `duration-150 / 200 / 300 / 700` scattered
   raw across 18 sites, no named ladder to tune from one place (ADR open-Q 1).
2. **`transition-all`** is banned by the ADR (it animates layout props,
   unpredictable) — MV-94 removed the one live site, but nothing *locked* it out.
3. **Nothing stopped a `framer-motion` import** creeping onto a Nepal→Australia
   funnel where low-end Android + metered data make ~30KB+ of JS-animation the
   exact cost the ADR forbids (ADR §1).

## What (mechanic)

- **`app/globals.css` `@theme`** — added a named duration ladder next to
  `--ease-calm`:

  ```css
  --transition-duration-fast: 150ms;    /* state feedback (hover/focus/press) */
  --transition-duration-medium: 200ms;  /* transform micro-moves (caret, hover) */
  --transition-duration-slow: 300ms;    /* medium reveals (plan card, dots) */
  --transition-duration-slower: 700ms;  /* progress-fill reveals — ADR ceiling */
  ```

  Tailwind v4 generates `duration-fast/medium/slow/slower` from the
  `--transition-duration-*` namespace, exactly as `--color-*`/`--text-*` do.
  **Build-confirmed** — production CSS emits
  `.duration-fast{--tw-duration:var(--transition-duration-fast);transition-duration:var(--transition-duration-fast)}`
  (and the other three), each resolving to its 150/200/300/700ms value.

- **18 raw `duration-N` sites → named tokens** across 16 files (`duration-150→fast`
  ×9, `200→medium` ×4, `300→slow` ×2, `700→slower` ×3). **1:1 value map → zero
  rendered change** (`.duration-fast` = `transition-duration: 150ms`, identical to
  the old `.duration-150`). Script-driven (scratchpad), word-boundary, exactly 18
  replacements matching the ADR tally.

- **`eslint.config.mjs`** — a `no-restricted-imports` block bans `framer-motion`,
  `gsap`, and `motion` + `motion/*`, each with an ADR-citing message. The ADR's
  narrow Phase-2 escape hatch is served by an explicit, reviewed `eslint-disable`
  — the friction the ADR asks for. **Verified firing** against a probe importing
  both `motion` and `framer-motion` (2 errors, correct messages).

- **`tests/styles/motion-tokens-ratchet.test.ts` (new)** — the durable enforcement
  ESLint can't do (it doesn't parse Tailwind class strings), same pattern as the
  card-shell / type-scale ratchets: the 4 tokens exist in `@theme`; **zero raw
  `duration-\d`/`duration-[` and zero `transition-all`** in `components/` + `app/`
  (`.tsx?`); no JS-animation library in `package.json`. A new raw duration or a
  `transition-all` now fails CI.

## Token-naming decision (blind call — one-line-tunable)

- The ADR's open-Q 1 *placeholder* was `--dur-1/2/3` (numeric). That name **cannot
  work** — I verified Tailwind v4.3.0 only generates `duration-<name>` utilities
  from the `--transition-duration-*` namespace, so `--dur-*` would leave the
  utility ungenerated and durations would silently fall back to the 150ms default.
  Named `--transition-duration-*` is forced by the framework.
- Chose a **monotonic speed ladder** (`fast < medium < slow < slower`) over numeric
  tiers — self-documenting at the call site, no false "default", matches the app's
  semantic-token convention (`ease-calm`, `text-title`). Values are the app's
  existing durations verbatim, so this is pure naming; retune any step in one
  `@theme` line at review.

## Test plan (TDD, red-first)

1. `tests/styles/motion-tokens-ratchet.test.ts` — RED first: 2 failed (tokens
   missing + 18 raw-duration offenders across 16 files), 2 passed (`transition-all`
   already clean from MV-94; no JS-anim deps). → GREEN after the token add +
   migration.
2. ESLint rule proven by a throwaway probe (`import { motion }` / `framer-motion`)
   → 2 `no-restricted-imports` errors with the ADR message; probe removed.

## Evidence — GREEN gate on `mv-107-motion-duration-tokens`

- `tsc --noEmit` — 0 errors.
- `eslint` — 0 errors (pre-existing `docs/kanban/build.mjs` unused-var warning only).
- **full suite — 274 files / 1751 tests passed, 0 failed.**
- `next build` — compiled clean; the four `duration-*` utilities emitted into the
  built CSS, each referencing its `--transition-duration-*` token.
- `git grep 'duration-[0-9]'` in components+app = 0.

## Ship

**SHIPPED 2026-07-07 → PR #TBD** (branch `mv-107-motion-duration-tokens` off
`origin/master 92a5c77`). In Review, founder-gated merge (never self-merged).
Disjoint from other branches except `app/globals.css` `@theme` (additive union
with MV-106's `--text-*`) and `board.json` (append-at-end).

## Resume notes (cold start)

Wave A step 2 done. Motion durations are tokenised + ratchet-locked; the
`transition-all` and JS-animation-library bans are fenced (ratchet + eslint).
ADR open-Q 1 resolved (yes). **Still open in the ADR:** Q2 (a second easing for
press/exit) and Q3 (`slide-fwd/back` keyframes — the tokens already exist in
`@theme` but are unused; add a consumer or drop them). Remaining Wave A: A3
landing restyle (non-mascot), A4 auth restyle (non-mascot), A5 Phase-2 shell
Card/VerdictPill/corridor-accent sweep. Gate G (founder): MV-85 mascot ✋, MV-86
imagery ✋, dispose MV-48/49/50. Wave B waits on mascot SVGs.
