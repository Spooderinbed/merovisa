# MV-51 — Optimistic save-state flip (Not saved / Shortlisted / Applied)

**Status:** IN REVIEW — SHIPPED 2026-06-26 on branch `mv-51` (branch+PR flow). Founder closes to Done after merge.

Relates to: [[MV-34]] (the Applied-freeze disclosure this control carries), [[MV-08]] (the `/api/shortlist` capture trigger the button drives). Source: 2026-06-26 founder-gap triage (perf complaint #4 — "big delay when switching between Not saved / Shortlisted / Applied").

## Problem

The funnel control lagged on every click. `ShortlistButton.choose` set a `busy` flag (disabling **all three** pills), `await`-ed the full `/api/shortlist` round-trip, and only flipped the active pill **after** `res.ok` returned. For "Applied" the round-trip is the slowest of the three — the route freezes the prediction-of-record and opens an attempt (`captureApplication`) — so the student tapped, watched every pill go dead, and waited for the network before anything visibly changed. Perceived lag on the core save action.

## What shipped

Optimistic update with rollback, in `components/matches/shortlist-button.tsx`:

1. **Instant flip** — `choose` now calls `setStatus(next)` synchronously *before* awaiting the fetch, so the pill reflects the tap immediately. The round-trip confirms in the background.
2. **Rollback on failure** — it captures `prev = status` at click time and reverts (`setStatus(prev)`) if the server responds non-OK **or** the fetch throws (network error). No silent divergence between UI and server.
3. **No more disabled pills** — the `busy` state and `disabled={busy}` were removed; all three pills stay clickable during a request, so a student can re-choose without waiting. The no-op guard (`next === status`) is kept, so clicking the already-active pill still issues no POST.

Initial-render DOM is **byte-identical** (React omits `disabled={false}`, which is what `busy=false` rendered before), so page goldens are unaffected. No scorer path touched; verdicts stay banded, no raw %.

## Test plan / evidence (TDD RED→GREEN, +3)

`tests/components/matches/shortlist-button.test.tsx` (+3, new describe "optimistic flip + rollback (MV-51)"), using a `deferred()` promise to hold the network in flight:

- **flips immediately** — with the fetch promise unresolved, the chosen pill is already `aria-pressed="true"` (the active state can only be optimistic, not response-driven). *(RED on old code: stayed false.)*
- **keeps every pill clickable mid-flight** — none of the three pills is `disabled` while a request is pending. *(RED on old code: all disabled via `busy`.)*
- **rolls back on server reject** — optimistic flip to Applied, then on a 500 the pill returns to the previous status (Shortlisted) and Applied goes inactive. *(RED on old code: never reached the optimistic assertion.)*

The 7 pre-existing tests still pass unchanged (the contract — which status each pill POSTs, the no-op guard, the MV-34 disclosure — is preserved).

**Gate green:** `npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing warning in `docs/kanban/build.mjs`, unrelated) · full suite **1364 passed** (231 files, was 1361 — +3) · goldens N/A (no scorer path) · initial-render markup unchanged.

## Out of scope (do NOT add here)

- A pending **spinner/indicator** — deliberately omitted; the optimistic flip *is* the feedback, and the design language is calm/flat (no noise). Add only if a confirmed need surfaces.
- **Concurrent rapid-click reconciliation** beyond last-rollback-wins (each in-flight `choose` rolls back to the status it captured) — acceptable for the MVP; not load-bearing.
- The **outcome funnel self-report** advance (that's [[MV-39]], already shipped).

## Founder-owned residuals (not blockers)

- **Merge the PR to master** (the single founder-gated step) → then close this card to **Done**.

## How a cold agent resumes

Done. UI-only, self-contained in `components/matches/shortlist-button.tsx` + its test. If a richer in-flight affordance is ever wanted, add a local `pending` flag for *styling only* — do **not** re-introduce `disabled`, which is the exact lag this card removed.
