# MV-100 — Matches progressive disclosure (signed-in)

**Priority:** P1   **Owner:** agent
**Goal:** Founder ask ⑥ — the signed-in `/matches` page renders every card in every verdict band at once (~86 cards), so the page opens as a wall, buries the Strong picks, and drags perf.

## Decision (founder-picked)
**Top N per band + "show more"** (chosen via AskUserQuestion over: collapsible-band accordion / sort-filter control bar). Rejected the sort/filter bar because re-sorting by cost or rank could float a cheap Reach above a Strong pick — cutting against the verdict-first honesty the app is built on. Bands + counts already existed; this adds disclosure *within* them. The anonymous results page already discloses (3 free + locked), so it is untouched.

## What shipped
- `components/matches/verdict-group.tsx` → now a client component with per-band `expanded` state and a new `initialVisible` prop (default 3). Shows the first N cards; a `Show N more <verdict> matches ▾` toggle reveals the rest and collapses back (`Show fewer ▴`). Header always shows the true total `(N)`.
- **Perf:** hidden cards are **not mounted** until expanded (the component slices `matches` and only maps the visible ones), so the DOM holds ~6 cards instead of ~86 — not CSS-hidden.
- `app/(app)/matches/page.tsx` → Reach band passes `initialVisible={0}` → fully collapsed by default (`Show 40 reach matches`), de-emphasising the stretch schools while keeping the count visible and one click away. Strong + Possible keep the default 3.
- **A11y:** the toggle is a real `<button>` with `aria-expanded` + `aria-controls={listId}` pointing at the card grid; explicit accessible label (`Show 31 more possible matches`); chevron is `aria-hidden`; singular "match" when exactly one is hidden. No toggle at all when a band fits within `initialVisible`.
- `ProgramCard` and the match data flow are untouched — verdict-first ordering + honesty preserved (`ProgramCard` is a shared component whose imports — `SourceAnchor` client, pure lib/data lookups — are all client-safe, so it renders fine inside the now-client `VerdictGroup`).

## Acceptance criteria
- [x] First `initialVisible` cards mount; the rest do not until expanded; header counts all.
- [x] Toggle reveals all and collapses back; `aria-expanded` flips.
- [x] Reach defaults to collapsed (0 visible) via `initialVisible={0}`.
- [x] No toggle when band count ≤ `initialVisible`; singular/plural noun correct.
- [x] Verdict wording still sourced from central `VERDICT_LABELS` (MV-42 guard intact).

## Test plan / evidence
- `tests/components/matches/verdict-group.test.tsx` extended (+5 behavioral tests over the original 2): mount-only-visible + true header count, reveal/collapse + aria-expanded, Reach-collapsed, no-toggle-when-fits, singular "match".
- Gate: `tsc` clean; `eslint` clean (1 pre-existing unrelated warning in `docs/kanban/build.mjs`); suite **1601 pass / 1 fail** — the 1 fail is the pre-existing MV-80 1-July freshness timer (`tests/data/freshness.test.ts`), unrelated to this slice.
- Browser verify skipped: the page is auth-gated and the dev port (3000) is held by the founder's own `npm run dev`; the RTL tests drive the real client component with `fireEvent` interactions as behavioral proof.

## Dependencies
- Independent of the MV-97/98/99 in-flight PRs (touches only `verdict-group.tsx` + `matches/page.tsx`). Branch `mv-100-matches-progressive-disclosure`, base `origin/master` (f6cada8). Board on this branch reflects master state (no MV-99/100 rows) until PRs merge and board.json is unioned.

## Deferred
- Sort/filter controls (the rejected option — revisit only with a verdict-first-preserving design).
- Special visual grouping for "also-considering" field-exploring matches (MV-99) — they still render inline with their exploratory reason.
- Applying the same disclosure to any future dense card list; scholarships/cost tabs.

## Agent resume notes
Built + gate-green on branch `mv-100-matches-progressive-disclosure`. Founder-gated merge (never self-merge). If MV-99 merges first, board.json will need a hand-union (both branches add cards) — regenerate `board.md`/`board.html` via `npm run board` after any union.
