# MV-98 — Footer CLS fix + perf

**Priority:** P1   **Owner:** agent
**Goal:** Kill the footer-first flash (footer paints high, then jumps down) and shave startup weight, so every page feels smooth on load.

## Context links
- Root-caused in the 2026-07-04 recon (footer is a layout sibling of a min-height-less streaming `<main>` + short loading skeletons).
- PR [#53](https://github.com/Spooderinbed/merovisa/pull/53) (base `design-stack`, commit `b96852a`).

## Acceptance criteria
- [x] `(app)` / `(marketing)` / `(focused)` layout shells are `flex min-h-dvh flex-col` with `<main className="flex-1">` — footer pinned to viewport bottom.
- [x] `(app)` / `(marketing)` `loading.tsx` reserve `min-h-[60vh]` so the fallback ≈ real page height.
- [x] PostHog lazy-loads via dynamic `import()` after the key check (off the initial bundle for anon visitors).
- [x] Corridor attr, AppBar, MobileTabBar, auth redirects/session-probe all preserved.

## Test plan / evidence
- New `tests/styles/layout-cls-ratchet.test.ts` (source-level ratchet; layouts are async server components not renderable in jsdom).
- Gate: `tsc` clean, `eslint` clean (7 files), suite **1645 pass / 1 fail** (pre-existing MV-80 freshness). Commit `b96852a`.

## Dependencies
- Stacked on design PRs #44–#51 (base `design-stack`). Merge after those.

## Deferred (own slices)
- Duplicate `auth.getUser()` dedup across layout+page (auth-touching — cache the probe / verify JWT locally).
- Browser-verify the streaming "no jump" under throttled network; tune `min-h-[60vh]` for very tall pages.
- Split the client-heavy results/matches tree into server components (bundle win).

## Agent resume notes
Shipped + In Review on PR #53. Perf follow-ups above are the next perf lever; or move to matches-page progressive disclosure (⑥) / step-4 multi-subject (②).
