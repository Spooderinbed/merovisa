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

## Evidence — built 2026-08-17, branch `mv-179-queue-day-view`

**Gate:** `npm run typecheck` clean · `npm run lint` clean · `npm test` **361 files / 3298 tests, 0 failed** (baseline before this slice: 3186 — 112 tests added).

### What shipped

| Piece | Where |
|---|---|
| Pure queue logic — next-action resolution (spec §2's 10-step order, step 6 slotted-not-stubbed), attention tiers, views, facets, workload counts, URL state | `lib/cases/queue.ts` + `tests/cases/queue.test.ts` (50 tests, order-asserting) |
| Queue repository — `listOrgCases` UNDERNEATH (scope inherited by composition), batched assignments + membership standing + open plan items, chunked `.in()`, enrichment failure fails the queue | `lib/cases/queue-repo.ts` + `tests/cases/queue-repo.test.ts` |
| The Day view | `app/(app)/workspace/[organizationId]/page.tsx` + `tests/app/day-view-page.test.tsx` (30 tests: roles, rendered ORDER, 40 rows, 4 empty states, cap, outage-vs-denial) |
| Components per spec §4 | `components/workspace/case-queue-{table,row,toolbar,shortcuts}.tsx`, `workload-summary.tsx`, `case-status-pill.tsx`, `case-link-state.tsx`, `staff-reference.tsx` |
| Shortcuts (`/` `j` `k` Esc; Enter is native anchor activation — deliberately no handler) | `case-queue-shortcuts.tsx` (sole client boundary) + `tests/components/case-queue-shortcuts.test.tsx` |
| Students page survives as **All cases** — dense table, name sort, in-memory q/status over the queue read; `StudentRow` cards RETIRED; rows link to the case overview (not `/manage`) | `students/page.tsx` refit; `tests/app/workspace-pages.test.tsx` + `case-pages.test.tsx` updated |
| Org chooser lands on the Day view | `app/(app)/workspace/page.tsx` |
| `OrgCaseSummary` carries `updated_at`; the search predicate moved to `queue.ts` (one meaning of "search") | `lib/cases/list-repo.ts` |

### Browser pass — method and what it caught

This machine has NO local Supabase stack (MV-172 evidence: zero Docker images; `npx supabase` broken on win32-x64) and production holds real PII with zero org cases — never a seed target. So the layout half ran as the jsdom-blindness recipe: a TEMPORARY harness route (deleted before commit, never committed) rendering the REAL components — table, toolbar, workload strip, shortcuts — over 40 fixture cases on the real dev server, measured via computed styles at 1280px and 375px, light and dark. The authenticated data path is proven by the unit/page suites and the CI integration stack; the live pass separately confirmed the real route's auth gate end-to-end (anonymous `/workspace/[orgId]` → `/auth?next=…`).

The pass caught TWO real defects a green jsdom suite could not see:

1. **Rows rendered 80–111px against the spec's 56–64px** — the identity cell's second line wrapped (email + pills), quietly rebuilding cards. Fixed: one-line truncating identity row + tightened padding → **64px uniform across all 40 rows**.
2. **The workload strip could not wrap at 375px** (separators nested inside the nowrap count spans left no break points) → horizontal page scroll. Fixed: separators outside the nowrap spans → zero overflowing elements at 375px.

Also verified live: attention order renders (unassigned first, archived last), `j`/`k`/`/`/Esc behave and `/` inside a control stays a typed slash, dark tokens re-resolve (`#141014` body), thead hides below `md` and rows flatten to bordered blocks with name + next action first, status pills carry no shadow or gradient, zero console errors.

### Decisions worth re-reading

- **`canAssign` derives from the list scope** (`all-org` ⇔ owner/admin under the current matrix) rather than a second `checkOrgPermission` round trip — everything it gates is presentation; the manage route and RLS re-decide. Documented in the page.
- **Workload counts come from the whole scope, unfiltered** — the strip answers "what does today hold", the table answers the current view. With `truncated`, the cap card says the counts don't cover the organization.
- **Enrichment failure fails the queue** (assignments/plan items decide tiers 1 and 6): a misordered queue is worse than an absent one (spec §5).
- **No overdue anything, no visa/lodgement columns** — confirmed absent; resolution step 6 / tier 4 hold an explicit slot in code comments for when a judgement read exists.
