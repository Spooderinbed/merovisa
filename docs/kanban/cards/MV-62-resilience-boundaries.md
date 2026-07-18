# MV-62 — Resilience: error + loading boundaries and no more silently-swallowed taps

**Priority:** P1 · **Owner:** agent
**Branch:** `mv-62-resilience-boundaries` · **Shipped:** 2026-06-26
**Source:** Tier-1 journey-completeness (founder steer "do tier 1 and tier 2 first"); resilience scoping from the 2026-06-25 design-division polish audit.

## North-star fit

The app should be complete and reliable enough that a Nepali student never needs a
local consultancy. The real user is on a **flaky connection** — a transient Supabase
read failure currently crashes a signed-in page to a blank/white frame, and a dropped
plan-action tap does nothing with no feedback. Both read as "this app is broken," and a
broken app is a bounce straight back to a consultancy. This slice makes failure **visible,
calm, and recoverable** instead of silent.

## Scope (deliberately tight)

The resilience-scoping pass proposed ~30 files. Scoped down to the highest-leverage set:

1. **`app/(app)/error.tsx`** — ONE segment error boundary covers **every** signed-in route
   (dashboard, matches, plan, profile, documents, checklist, guide) because they all live
   under the `(app)` route group. Catches a thrown live read (the dashboard's six-way
   `Promise.all` at `dashboard/page.tsx:47`, the matches page's four-way one) and shows a
   calm branded "We couldn't load this page — your data is safe, try again" with a working
   `reset()`.
2. **`app/(app)/loading.tsx`** — ONE navigation loading skeleton for the same group: flat
   paper blocks (no spinner) in the "calm authority" language, `aria-busy`/`sr-only`
   announced. A slow read now looks like loading, not a hang.
3. **`app/global-error.tsx`** — last-resort boundary for a root-layout failure (where the
   per-segment boundary can't reach). Renders its own `<html>/<body>`, inline-styled with
   brand hex (CSS/fonts may be the thing that failed), self-contained retry.
4. **`components/plan/plan-item-card.tsx`** — the silent `.catch(() => null)` at the POST:
   a failed Done / Dismiss / Mark-in-progress / Undo tap used to leave the card unchanged
   with **no feedback**. Now surfaces a visible `role="alert"` "We couldn't save that just
   now — try again." and keeps the prior state (mirrors the `outcome-self-report.tsx`
   pattern). State only flips on a confirmed-ok response.

### Out of scope (intentionally)

The wider audit list (per-route bespoke skeletons, anonymous/marketing/focused trees,
toast infra). The `(app)` group boundary + the one user-action silent-catch cover the
journey-reliability risk for signed-in students; the rest is polish, deferrable.

## Acceptance criteria

- [x] A thrown server read on any signed-in route renders a calm retry, not a white screen.
- [x] Navigating to a signed-in route streams a skeleton, not a blank frame.
- [x] A root-layout failure renders a self-contained retry page.
- [x] A failed plan-action tap shows a visible error and does not silently change state.
- [x] A successful retry clears the error and applies the change.

## Test evidence (TDD)

- `tests/components/plan/plan-item-card.test.tsx` (+3): network-fail surfaces error + keeps
  open; non-ok surfaces error + no state change; successful retry clears error + applies.
  Red confirmed before the fix.
- `tests/app/error-boundaries.test.tsx` (new, 3): AppError message + `reset()` wired;
  AppLoading announces `aria-busy` + "Loading…"; GlobalError self-contained retry calls
  `reset()`.

## Gate

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors (1 pre-existing warning in untouched `docs/kanban/build.mjs`).
- Full suite — **1401 passed (236 files)**.
- Goldens — N/A (no scoring-engine path touched).
- Design language — flat paper, thin borders, no shadow/gradient; `animate-pulse` already
  in house use (`profile-recap.tsx`).

## Founder review

- Copy: "We couldn't load this page / your saved data is safe / Try again" and the
  plan-card "We couldn't save that just now — try again."
- Note: `error.tsx` logs to `console.error`; wiring these into Sentry is a follow-up (the
  monitoring stack is listed but not yet confirmed live in this slice).

## Files touched

- `app/(app)/error.tsx` (new), `app/(app)/loading.tsx` (new), `app/global-error.tsx` (new)
- `components/plan/plan-item-card.tsx`
- `tests/components/plan/plan-item-card.test.tsx`, `tests/app/error-boundaries.test.tsx` (new)
- `docs/kanban/board.json` + regenerated `board.md` / `board.html`
