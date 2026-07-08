# MV-115 — Signed-in chrome inside the min-h-dvh column (footer pins, no dead scrollbar)

**Priority:** P2 · **Owner:** agent
**Branch:** `mv-115-app-chrome-column` (off `master`)
**Goal:** On every signed-in page — including short/empty states and the streamed
`loading.tsx` fallback during route transitions — the footer pins to the viewport
bottom and there is no persistent dead scrollbar.

## Context links
- Audit: [docs/audits/2026-07-08-jsdom-blind-audit.md](../../audits/2026-07-08-jsdom-blind-audit.md) — finding **#1** (Tier 1, CONFIRMED medium, bug class G).
- Lesson: [[2026-07-08-jsdom-blind-to-layout]] — a green jsdom suite (no layout engine) can't see this; guard the class/structure contract.
- Code: `app/(app)/layout.tsx`; mirror `app/(marketing)/layout.tsx:26` + `app/(focused)/layout.tsx:10`.

## What was wrong
The `(app)` layout wrapped the chrome in a `display:contents` div (a boxless token
carrier for the corridor scope). `AppBar` (~66px) and `JourneyMarker` (~37px) were
placed as siblings of the `min-h-dvh` flex column that holds `main` + `Footer`.
Because `contents` generates no box, those two chrome elements became flow children
of `<body>` sitting **above** the 100dvh column. So the document was always
~100dvh + ~103px tall → a persistent ~103px dead scrollbar on every short signed-in
page (empty states) and on the streamed `loading.tsx` fallback during *every* route
transition, with the footer sitting below the fold. The marketing and focused
layouts put the header *inside* the column (correct); the `(app)` layout kept the
MV-98 "footer pinned" comment but had regressed the invariant.

## The fix
Moved `AppBar` + `JourneyMarker` **inside** the `flex min-h-dvh flex-col` column,
before `<main>` — mirroring `app/(marketing)/layout.tsx`. Now the column contains
all flow content (chrome → main → footer); on a short page `main` (flex-1) fills the
slack and the total is exactly one viewport, so no overflow and the footer pins.
`MobileTabBar` stays a sibling of the column (it is `position:fixed`, contributes no
flow height). The `contents` corridor scope still wraps everything, so the
`data-corridor` accent hook is unchanged.

## Acceptance criteria
- `AppBar` and `JourneyMarker` share the same `min-h-dvh` flex parent as `main` and `Footer`.
- The corridor scope (`[data-corridor="np-au"]` / `contents`) still wraps the whole shell.
- The `pb-[calc(56px+…)] md:pb-0` tab-bar padding stays on the flex column.
- No behavioural change to auth redirect, journey-signal degradation, or `MobileTabBar`.

## Test plan
`tests/app/app-layout.test.tsx` — added a structure-contract guard (jsdom CAN see
DOM nesting): the parent of `<main>` is the `min-h-dvh` column and it contains
`footer`, `appbar`, and `journey-marker`. Proven RED on the pre-fix tree (appbar
null inside the column) → GREEN after the move. Existing corridor + pb + marker +
degradation tests still pass.

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
None. Presentational/structural only — no scoring, API, DB, or Zod touched; goldens untouched.

## Risk notes
Low. Mirrors a layout already correct in production (marketing). Auth-gated shell is
not renderable in the headless preview (Google OAuth), so the authed visual pass is
founder-owed — but the DOM contract is locked by test and the CSS behaviour follows
deterministically from marketing-layout parity.

## Agent resume notes (for a cold start)
Done + green. Next action: move card to In Review, open the PR, leave merge
founder-gated. This is fix #1 of the 5-slice jsdom-blind fix phase (next: MV-116
disclosure focus ring).

## Decision log
- 2026-07-08 — Kept `MobileTabBar` outside the column (fixed, no flow height). Kept
  the `contents` corridor wrapper (token carrier). Moved only the two flow-chrome
  elements inside.

## Done evidence
- Gate green: typecheck 0 errors · lint 0 errors (pre-existing `build.mjs` warning only) · **295 files / 1897 tests** pass (+1 structural guard).
- New guard RED→GREEN verified on the pre-fix vs fixed tree.
- Dev server compiled the changed layout with no error (redirect path exercised).
- Branch `mv-115-app-chrome-column`; PR pending.
