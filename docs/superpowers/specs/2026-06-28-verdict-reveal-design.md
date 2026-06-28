# MV-76 — verdict two-beat reveal + Applied-commit confirm beat (audit #25)

**Date:** 2026-06-28
**Slice:** MV-76 (Phase B, audit #25, P2). Sibling of MV-46 (audit #24 completion beats).
**Surfaces:** the banded verdict card (`components/results/verdict-card.tsx`) and the
MV-39 outcome self-report control (`components/outcomes/outcome-self-report.tsx`).

## Problem

Audit #25: *"Verdict reveal has no more weight than any sibling card."* The verdict is the
product's defining trust moment, yet it mounts with the same single `animate-rise` as any
other card. The audit asks for a **two-beat reveal** — the card rises, then the band pill
settles ~120ms later — so the verdict reads as the headline, not a peer tile. Paired ask: a
**quiet confirm beat** when a student commits an outcome on the MV-39 control, which today
swaps silently.

## Trust constraints (non-negotiable)

1. **Never imply a score.** The 0–100 weighted number is never rendered. The reveal must
   animate *only* the banded word-label — animating a number (or anything number-shaped)
   would read as a computed percentage settling into place. Only the word pill is staggered.
2. **Tone-safe confirm.** The same self-report control reports a *refusal* as well as an
   *offer*. The confirm beat is deliberately neutral — the word "Saved", `text-ink-soft`, no
   colour, no glyph — so recording bad news never reads as a celebration.
3. **Reduced-motion honest.** The global `prefers-reduced-motion` guard zeroes every
   animation/transition *duration* (not `animation-delay`). So the 120ms second-beat pause is
   encoded as a **keyframe hold** (`0%, 22%` of a 0.55s run ≈ 121ms), not `animation-delay`.
   Under reduced motion the whole thing collapses to its final state — no blank flash.

## Design

### Beat 1 — card rise (unchanged)
The verdict `<section>` keeps `animate-rise` (0.55s, `ease-calm`). No change.

### Beat 2 — band pill settle (new)
A new `settle` keyframe + `--animate-settle` token in `app/globals.css`:

```css
--animate-settle: settle 0.55s var(--ease-calm) both;
@keyframes settle {
  0%, 22% { opacity: 0; transform: translateY(6px); }   /* holds ~120ms */
  100%    { opacity: 1; transform: none; }               /* then settles */
}
```

Applied as `animate-settle` to the band-label `<span>` only. Same total duration as the card
rise; the front-loaded hold makes the pill land a beat after the card.

### Confirm beat — MV-39 control
On a successful `/api/outcomes/event` POST, set a `confirmed` flag and render a neutral
`Saved` note (`animate-settle`, `text-ink-soft`) beside the "Report an update" eyebrow, then
`router.refresh()` (unchanged — still fires once). The beat belongs to the step just left, so
it clears when the legal-next-steps set changes. Cleared via React's *adjust-state-on-prop-
change* render pattern (a `seenKey` mirror of `options.join(",")`), not an effect — no stale
extra paint, and it satisfies `react-hooks/set-state-in-effect`.

## Architecture / why here

- The keyframe lives with its sibling `rise`/`fade` tokens; nothing else changes globally.
- `verdict-card.tsx` stays a server component (pure CSS class).
- The confirm-beat state is local to the already-client `OutcomeSelfReport`; no API or
  server change. `router.refresh()` semantics are untouched, so the existing
  "refreshes on success" contract holds.

## Tests (TDD)

- `verdict-card.test.tsx` — card keeps `animate-rise`; band pill carries `animate-settle`; the
  animated pill text contains no digit (score-implication guard).
- `outcome-self-report.test.tsx` — a successful **refusal** report shows a neutral `Saved`
  (no `strong/reach/possible/success/green` class) with `animate-settle`, and still refreshes
  once; the beat clears when re-rendered with the next milestone set.

## Out of scope (YAGNI)

The audit's *optional* staggered factor-bars are deliberately skipped — they touch the factor
surface and add motion to numeric bars, the exact thing the trust constraint guards against.
