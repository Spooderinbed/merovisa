# ADR — Motion v2 (CSS-first motion system)

**Status:** Adopted (durations + bans applied in MV-107) · **Date:** 2026-07-03 · **Card:** MV-93 (decision) → MV-107 (applied) · **Owner:** agent

> **Applied in MV-107 (2026-07-07).** Open question **1** resolved *yes*: a named
> duration ladder shipped as `@theme` tokens (`--transition-duration-fast` 150 /
> `-medium` 200 / `-slow` 300 / `-slower` 700) and the 18 raw `duration-N` sites
> migrated 1:1 (zero rendered change). The namespace is **`--transition-duration-*`**
> — Tailwind v4 generates `duration-fast/medium/slow/slower` from it; the `--dur-*`
> placeholder proposed below was dropped because it does not generate a utility
> (verified). Adoption items **1** and **4** also landed: `transition-all` and the
> JS-animation libraries (`framer-motion` / `motion` / `gsap`) are now fenced by a
> ratchet (`tests/styles/motion-tokens-ratchet.test.ts`) + `no-restricted-imports`
> in `eslint.config.mjs`. **Still open:** Q2 (a second easing) and Q3
> (`slide-fwd/back` keyframes — defined in `@theme` but still unused). Token names
> are one-line-tunable at review.
**Decision scope:** how the app animates — the motion *vocabulary*, the *rules*
for using it, and the *architectural* call to stay CSS-first. Companion to the
[type-scale ADR](2026-07-03-type-scale-adr.md); both are foldable into
`docs/design/2026-07-03-elevated-calm-overhaul-spec.md` on sign-off. This doc
lives standalone for now so it can be reviewed on its own.

---

## Context

The design language mandates one motion feel — `cubic-bezier(.22,.61,.36,1)`,
"calm authority," no visual noise. The app already has a small, coherent CSS
motion system in `app/globals.css`. A repo audit (2026-07-03) mapped it:

**Tokens (`@theme`):**
- `--ease-calm: cubic-bezier(0.22, 0.61, 0.36, 1)` — the single easing.
- `--animate-fade: fade 0.5s var(--ease-calm) both` — opacity in.
- `--animate-rise: rise 0.55s var(--ease-calm) both` — opacity + `translateY(12px)`.
- `--animate-settle: settle 0.55s var(--ease-calm) both` — a *second-beat* reveal:
  the keyframe holds hidden through 0–22% (≈120ms) then rises, so a delayed beat
  needs no `animation-delay`.

**Keyframes:** `fade`, `rise`, `settle` — **all animate only `opacity` +
`transform`.** The system is already compositor-safe; this ADR makes that a rule.

**Reduced-motion guard:** a global `@media (prefers-reduced-motion: reduce)` block
collapses every animation/transition to `~0.01ms` (not 0, so `animationend` still
fires) and reaches the final state with no movement.

**Usage tally (`components/` + `app/`):** `ease-calm` ×24 · `transition-colors`
×14 · `animate-pulse` ×14 (skeletons) · `duration-150` ×9 · `animate-rise` ×4 ·
`duration-200` ×4 · `duration-700` ×3 · `animate-fade` ×3 · `transition-transform`
×3 · `animate-settle` ×2 · `duration-300` ×2 · **`transition-all` ×1** ·
`transition-[width]` ×2 · `transition-[stroke-dashoffset]` ×1.

**No runtime animation library is installed** (`framer-motion` / `motion` absent
from `package.json`).

**What's drifting / worth deciding:**

1. **No stated rule** that motion stays CSS-first — nothing stops a future PR from
   pulling in `framer-motion` (~30KB+ gzipped) onto a Nepal→Australia funnel where
   low-end Android + metered data are the norm.
2. **`transition-all` ×1** is a latent smell — it animates layout properties and
   is unpredictable; the rest of the app is disciplined (explicit prop lists).
3. **Durations are magic numbers** — 150/200/300/700 scattered as raw
   `duration-N`, with no named ladder to tune from one place.
4. **Stagger is undocumented** — `settle`'s baked-hold trick is a one-off with a
   good reason (reduced-motion safety) that isn't written down as a pattern.

---

## Decision

Motion stays **CSS-first**, built from a **named, minimal vocabulary**, governed by
a few **hard rules**. New motion uses the tokens below; reaching for a raw
`transition-all` or a JS animation library is a reviewable smell.

### 1. CSS-first — no runtime animation library

**No `framer-motion` / `motion` / `gsap`.** The app's motion needs (entrances,
hover/focus state, one delayed reveal) are fully served by CSS keyframes +
transitions at **zero bundle cost**. The funnel's users are the reason: bytes and
main-thread work are expensive on low-end Android.

**Escape hatch (narrow):** if a *Phase-2* feature genuinely needs
layout/FLIP animation CSS can't express (e.g. guide-chat message reflow, a
draggable drawer), introduce a **single tree-shaken micro-primitive** (`motion/mini`
class, ~2–3KB) scoped to that one surface — never a global adoption. Default = no.

### 2. Two motion classes, two rules

| Class | What it covers | Animate **only** |
|-------|----------------|------------------|
| **Movement / entrance** | Things that appear or move (card rise, verdict reveal, list reveals) | `opacity` + `transform` — **compositor-only**. Never `width`/`height`/`top`/`left`/`margin` (layout thrash). |
| **State transition** | Hover / focus / press feedback | Paint-only props: `color`, `background-color`, `border-color`, `opacity`, `transform`. Use `transition-colors` or an explicit prop list. |

**Hard rules (both classes):**
- **Never `transition-all`.** It animates layout props and is unpredictable — name
  the properties. (Migrate the 1 current site.)
- **Never bypass the reduced-motion guard.** Bake any delay into keyframe *phases*
  (the `settle` pattern), not `animation-delay` — so the guard, which only zeroes
  duration, still collapses to the final state with no blank flash.
- **One easing.** `--ease-calm` everywhere. A second curve is added only against a
  demonstrated need (see open questions), not pre-emptively.

### 3. Vocabulary (the sanctioned set)

| Token / util | Use for |
|--------------|---------|
| `--ease-calm` (`ease-calm`) | **Every** transition and animation. |
| `--animate-fade` | Opacity-only entrance (no movement). |
| `--animate-rise` | Standard entrance — opacity + 12px rise. The default for cards/sections. |
| `--animate-settle` | Second-beat reveal that must land *after* a preceding rise. |
| `animate-pulse` (Tailwind) | Loading skeletons only. |
| `transition-colors` + `duration-150` | Hover / focus / press state. |

New keyframes are added only when a real consumer needs one (no speculative
`slide-fwd`/`slide-back` until a route/drawer transition exists — see open
questions).

### 4. Stagger convention (for sequential list reveals)

- Stagger **≤ 5 siblings**; beyond that, fade the *container*, not each child
  (cheaper, and avoids a long trailing cascade).
- **40–60ms** inter-child offset.
- **Nothing animates after ~700ms** total elapsed — a slow mount must never leave
  motion running. `duration-700` is the ceiling, not a default.
- Prefer baking the offset into keyframe phases (the `settle` approach) over
  per-item `animation-delay`, for reduced-motion safety.

---

## Consequences

**Positive**
- A written contract: reviewers can reject `transition-all`, a stray easing, or a
  `framer-motion` import by pointing at this ADR.
- Motion stays free (no bundle cost) on the funnel that most needs it to.
- The `settle` reduced-motion pattern becomes reusable instead of a mystery.

**Negative / cost**
- Requires a tiny cleanup slice (the 1 `transition-all`) and, if adopted, a
  duration-token migration.
- CSS-first means some richer interactions (shared-element transitions) stay off
  the table until the escape hatch is justified — an intentional constraint.

**Neutral**
- No bundle change; the vocabulary already ships. This ADR mostly *ratifies* and
  documents the existing system, then fences it.

---

## Alternatives considered

**A — CSS-first, codify the existing vocabulary + rules (chosen).** Lowest cost,
matches the design language, keeps the funnel lean. The app already proves it's
sufficient.

**B — Adopt `framer-motion` / `motion-one`.** A richer, JS-driven system with
layout animations and gesture support. **Rejected:** ~30KB+ gzipped and
main-thread cost on a low-end-Android funnel, to buy capability the product's calm,
restrained motion doesn't use. The narrow escape hatch preserves the *option* for
one Phase-2 surface without a global commitment.

**C — No ADR, keep motion ad-hoc.** **Rejected:** `transition-all` and magic
durations are already drifting, and nothing prevents a heavy dependency creeping
in. The cost of a runaway is exactly what the funnel can't afford.

---

## Open questions (for sign-off)

1. **Duration tokens** — introduce `--dur-1: 150ms / --dur-2: 200ms / --dur-3:
   300ms` and migrate the raw `duration-N`, or leave Tailwind's `duration-150`
   as-is? (This ADR *records the ladder* but doesn't mandate tokenising it.)
2. **A second easing** (`--ease-out-emphatic`) for press/exit micro-feedback —
   real need, or is "one easing everywhere" the whole point of calm authority?
3. **`slide-fwd` / `slide-back` keyframes** — pre-define for future
   route/drawer transitions, or add only when the first consumer lands (YAGNI)?

---

## Adoption plan (tracked separately — not this slice)

Decision-only ADR. Follow-on, each small and founder-gated:

1. Replace the 1 `transition-all` with an explicit prop list.
2. (If Q1 = yes) add `--dur-*` tokens to `@theme`; migrate raw `duration-N`.
3. Fold this vocabulary into the overhaul spec's motion section.
4. Add a lint/review note banning `transition-all` and JS animation deps.
