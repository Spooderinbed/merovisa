# MV-116 — Disclosure trigger focus ring visible under overflow-hidden (WCAG 2.4.7)

**Priority:** P2 · **Owner:** agent
**Branch:** `mv-116-disclosure-focus-ring` (off `master`)
**Goal:** Keyboard focus on every profile section header (and any `Disclosure`) shows
a visible focus outline.

## Context links
- Audit: [docs/audits/2026-07-08-jsdom-blind-audit.md](../../audits/2026-07-08-jsdom-blind-audit.md) — finding **#2** (Tier 2, CONFIRMED medium, bug class E).
- Lesson: [[2026-07-08-jsdom-blind-to-layout]] — jsdom has no layout engine and can't see a clipped outline; guard the class contract.
- Code: `components/ui/disclosure.tsx`; consumed by `components/profile/section-accordion.tsx` (8 profile groups) + `components/results/results.tsx`. Global ring: `app/globals.css:242`.

## What was wrong
`Disclosure` wraps its trigger + panel in `<Card overflow-hidden>`. `Card` defaults to
`rounded-lg` (16px) + border + **no padding**, and the trigger `<button>` is `w-full`
with its own `px-5 py-4` — so the button's border box is flush with the Card's clip box.
The global focus ring (`globals.css:242`) is `outline: 2px solid var(--primary);
outline-offset: 2px` — painted 2px **outside** the box — so `overflow-hidden` clips it
away. Every collapsed profile section header (the default state) showed no visible
keyboard focus outline in any browser. `overflow-hidden` is load-bearing (it clips the
header's `hover:bg-bg-tint` to the card's rounded top corners), so it can't just be
dropped.

## The fix
Inset the ring on the trigger only: append `focus-visible:[outline-offset:-2px]` to the
button. The ring now paints 2px **inside** the box, fully within the clip. The global
rule already sets `border-radius: inherit`, so the inset outline inherits the card's
16px radius and reads concentric/intentional. `overflow-hidden` (and its hover-bg corner
clipping) is preserved.

## Acceptance criteria
- The trigger button carries `focus-visible:[outline-offset:-2px]`.
- `Card` keeps `overflow-hidden` (hover-bg corner clip preserved).
- Tailwind compiles the arbitrary utility (not a silent no-op) and it wins specificity over the global `:focus-visible`.

## Test plan
`tests/components/disclosure.test.tsx` — added a class-contract guard: the trigger's
className contains `focus-visible:[outline-offset:-2px]`. RED before the fix → GREEN
after. Existing Disclosure + SectionAccordion + profile-page tests unchanged and green.

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
None. Presentational only — no scoring/API/DB/Zod; goldens untouched.

## Risk notes
Low. Scoped to the trigger; preserves `overflow-hidden`. The profile surface is
auth-gated and results is wizard-gated, so a keyboard-tab visual pass in-context is
founder-owed — but the compiled rule was verified present in the served stylesheet
(`.focus-visible\:\[outline-offset\:-2px\]:focus-visible { outline-offset: -2px }`,
specificity 0,2,0 > global 0,1,0), which de-risks the one silent-failure mode
(a dropped arbitrary utility) jsdom couldn't catch.

## Agent resume notes (for a cold start)
Done + green. Fix #2 of the 5-slice jsdom-blind fix phase (after MV-115 chrome column;
next: MV-117 plan/freshness accordion snap). Move to In Review, open PR, founder-gated merge.

## Decision log
- 2026-07-08 — Chose inset-ring over `overflow-visible` because `overflow-hidden`
  is load-bearing (clips header hover-bg to the rounded corners). Verified Tailwind
  emits the arbitrary utility with winning specificity via the served stylesheet.

## Done evidence
- Gate green: typecheck 0 · lint 0 errors (pre-existing `build.mjs` warning only) · **295 files / 1897 tests** pass (+1 guard).
- Guard RED→GREEN verified.
- Live: served CSS contains `.focus-visible\:\[outline-offset\:-2px\]:focus-visible { outline-offset: -2px }` (specificity beats the global ring).
- Branch `mv-116-disclosure-focus-ring`; PR pending.
