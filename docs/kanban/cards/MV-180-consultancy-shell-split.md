# MV-180 — Consultancy shell split + team-access correction

**Priority:** P1 · **Owner:** agent · **Created:** 2026-08-17

## Why

The signed-in chrome describes the actor as a student even while they process consultancy cases (journey marker, "My plan", student mobile tabs render inside `/workspace`). Slice ② of the workspace UI lane. **Spec:** `docs/superpowers/specs/2026-08-17-consultancy-workspace-ui.md` §1 (signed-in shells) + §5, and preamble amendment 3.

## Scope

- Refactor `app/(app)/layout.tsx` into a neutral authenticated shell with student and consultancy layouts via route groups — public URLs unchanged.
- Consultancy shell: workspace top bar (mark, current org, switch-org, user affordance) + org rail (Day view / All cases / Team / owner-only Settings); compact horizontal row below `md`, no second bottom bar. Student chrome (AppBar journey marker, MobileTabBar, student footer) absent from workspace routes and vice versa.
- `/workspace` refits to auto-enter a sole active organization, stays a chooser for multiple, keeps the honest zero-org and lookup-failed states.
- **Fix the team-page access bug (Codex finding, verified in spec §0):** the team page currently gates the counsellor's matrix-permitted read-only view behind `org.manage` (cell 4 vs cell 5). Restore counsellor read-only team access; mutation stays owner/admin.
- `TeamMemberRow` refits to a dense roster row using `StaffReference` (role + truncated id — F-9 stands, no names exist).

## Acceptance criteria

1. No student journey UI on any workspace route; no org rail on any student route; both proven by shell tests.
2. Sole-org actor lands on the Day view without the chooser; multi-org and zero-org behavior unchanged.
3. A counsellor can READ the team roster; mutation affordances stay omitted-and-denied for them (route re-decides, not just presentation).
4. Org switching keeps tenant clarity (current org always visible in the top bar).
5. Gate green + live browser pass covering dashboard→workspace and workspace→dashboard navigation.

## Test plan

Per spec §7 PR 2: shell-presence/absence tests both directions; role tests for team read vs team mutation (mutation-test the fix — a denial-only probe is inert, MISTAKES.md: testing); active/inactive membership + switching tests.

## Resume notes

Branch `mv-180-consultancy-shell` off master after MV-179 merges (the rail's "Day view" target must exist). Independent of Stage 4/5 — no data dependencies.
