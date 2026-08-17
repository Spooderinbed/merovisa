# MV-179 — Queue-first Day view for the consultancy workspace

**Priority:** P1 · **Owner:** agent · **Created:** 2026-08-17

## Why

A counsellor processes ~40 concurrent cases; the current students page renders each as a large vertical card with no queue, no next action, no workload picture. This is slice ① of the workspace UI lane — the highest-leverage change in the adopted design spec.

**Spec (source of truth):** `docs/superpowers/specs/2026-08-17-consultancy-workspace-ui.md` — §2 (Day view) in full, plus §1's URL/keyboard addressability and the preamble amendments. Build exactly what §2 says; this dossier only summarizes.

## Scope

- New route `app/(app)/workspace/[organizationId]/page.tsx` — the Day view: workload summary strip (text counts, no charts), view tabs (Needs action / All / Waiting on student / Ready for review / Needs assignment for owner+admin), GET-form filters (q, status, link state, assignee, sort), dense semantic table (56–64px rows, no cards), cap + empty states per spec.
- Pure helpers: attention-priority sort + next-action resolution (spec §2 lists the exact 10-step order for each) — deterministic, unit-tested first.
- Queue repository batching assignments, `updated_at`, and plan items on top of `listOrgCases` (keep its security rules; scope narrowing stays load-bearing).
- `case-queue-*` components per spec §4 inventory (`case-queue-table`, `case-queue-row`, `case-queue-toolbar`, `case-status-pill`, `staff-reference`, `workload-summary`, `case-queue-shortcuts` as the only client boundary).
- `/workspace/[organizationId]/students` survives as "All cases"; `StudentRow` cards retire.

## Out of scope

- NO Overdue anything (no due-date data exists — spec §0 finding). NO visa-read / lodgement columns (their stages haven't shipped; omit entirely, no "coming soon"). NO shell split (MV-180) or case-frame refit (MV-181).

## Acceptance criteria

1. Owner/admin land on a queue of every visible non-archived org case; counsellor sees assigned-only; closed cases only under All; counts respect scope.
2. Every row derives exactly one next action via the spec's resolution order; attention sort follows the spec's tier order with `updated_at`-oldest tie-break; "Updated" is never presented as a deadline.
3. Queue state is URL-addressable (`view`/`q`/`status`/`link`/`assignee`/`sort` GET params, defaults omitted); back-button restores exact prior filters.
4. `/`, `j`, `k`, Enter shortcuts work; Tab navigation stays complete; case links are real `<Link>`s, rows have no click handlers.
5. All four empty states (zero cases owner vs counsellor, nothing-needs-action, filtered-empty) and the 500-row cap warning render per spec; outage never renders as denial or emptiness.
6. Gate green (`typecheck`/`lint`/`test`) + live browser pass at desktop and 375px with 40 seeded cases.

## Test plan

Per spec §7 PR 1: pure-helper unit tests (priority + next-action, every branch); repo tests all-org vs assigned + batched reads; page tests per role incl. zero states; component tests for semantic table markup, 40 rows, filters, shortcuts. Guard against vacuity: assert on rendered ORDER, not just presence (MISTAKES.md: testing).

## Resume notes

Branch `mv-179-queue-day-view` off master AFTER PR #143 (MV-172) merges — the queue links rows to the case routes #143 created. Board: this card entered Ready 2026-08-17 with the spec's adoption (PR #144 branch).
