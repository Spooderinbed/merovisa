# MV-184 — Workspace loading and error boundaries (UI lane slice 8a)

**Priority:** P1 · **Owner:** agent · **Created:** 2026-08-19

## Why

`app/(app)/loading.tsx` is the only loading state any signed-in route gets, and it is
**student-shaped**: `max-w-[1120px]`, one heading bar, then a `1.5fr_1fr` two-column card
grid — the dashboard's silhouette. Every consultancy workspace route inherits it, so a
slow queue renders a layout that looks nothing like the queue it is about to become, and
the skeleton lies about the shape of what is coming.

There is no `loading.tsx` and no `error.tsx` anywhere under `app/(app)/workspace/`. An
unhandled throw inside a workspace page therefore bubbles to `app/(app)/error.tsx`, whose
copy ("We couldn't load this page", "your saved data is safe") is written for a student
reading their own assessment, not for a counsellor who has lost sight of a queue of other
people's cases.

Spec §6 ("What survives") decides this: *Shared `(app)` loading/error states → split into
student and workspace variants while preserving the honest failure semantics.*

**Spec:** `docs/superpowers/specs/2026-08-17-consultancy-workspace-ui.md` §5 (Loading and
Error) and §6 (the `Shared (app) loading/error states` row). Those two passages are the
acceptance criteria; this dossier elaborates them.

> **Note on the plan file.** The task brief pointed at
> `docs/superpowers/plans/2026-08-19-consultancy-workspace-ui-build.md` §MV-184. **That
> file does not exist in this repository** — not on `master`, not on any ref
> (`git log --all -- 'docs/superpowers/plans/2026-08-19*'` returns nothing). The spec's
> own §5/§6 and §7 "PR 8 — State, accessibility, and density gate" were used as the
> contract instead, which is what the brief itself names as authoritative.

## Scope

**Loading (5 route-segment files).**

| File | Shows |
|---|---|
| `app/(app)/workspace/[organizationId]/loading.tsx` | heading block, workload-summary strip, toolbar, **eight** flat row skeletons |
| `app/(app)/workspace/[organizationId]/students/loading.tsx` | case-header skeleton, section rail, two flat content panels — the **frame** silhouette |
| `app/(app)/workspace/[organizationId]/students/[caseId]/loading.tsx` | two flat content panels — the **section** skeleton, inside the resolved frame |
| `app/(app)/workspace/[organizationId]/team/loading.tsx` | real "Team" heading, roster skeleton only |
| `app/(app)/workspace/[organizationId]/settings/loading.tsx` | real "Organization settings" heading, form skeleton only |

**Error (3 client boundaries).**

| File | Copy |
|---|---|
| `app/(app)/workspace/[organizationId]/error.tsx` | "We couldn't load this queue" + Retry |
| `app/(app)/workspace/[organizationId]/students/[caseId]/error.tsx` | "We couldn't load this student" + Retry |
| `app/(app)/workspace/[organizationId]/team/error.tsx` | "We couldn't load the team" + Retry |

## The correction the browser pass forced (read this before editing any of it)

The brief, following spec §5, put the case skeleton — header, rail, two panels — at
`students/[caseId]/loading.tsx`. **Built there, it is wrong, and the live browser pass
proved it.** A route-segment `loading.tsx` renders *inside its own segment's layout*, so
that file can only ever appear once the case frame has already resolved: the screenshot
showed the real header and the real section rail on screen with a **second, skeleton copy
of both** drawn beneath them, plus a stray hairline at the wrong width.

Worse, the boundary Next actually reached for while the frame itself was loading was the
nearest **ancestor** — `[organizationId]/loading.tsx`. Opening one student rendered the
organization queue's eight-row skeleton.

So the two states were separated:

- `students/loading.tsx` — the frame silhouette. This is the ancestor of the case layout,
  so it is the only place a frame-shaped skeleton can actually cover the frame.
- `students/[caseId]/loading.tsx` — the panels only. Correct for section-to-section
  navigation, where the frame stays mounted and only the content changes.

Re-measured after the change, in a real layout engine: exactly one header skeleton, one
rail, two panels, **zero** queue rows, no horizontal overflow, and the grid resolving to
the frame's own `184px minmax(0px, 1fr)`. Two tests pin it — one asserts the section
skeleton draws no header and no rail, the other asserts `students/loading.tsx` uses the
frame layout's grid class string character for character.

The residual: `students/loading.tsx` also covers All cases and Add a student, which are
not frames. That is a shape mismatch on two secondary destinations, taken deliberately so
the Day view → case navigation — by far the most travelled path in the workspace — stops
showing a queue that is not loading. Neither state states anything false: no route is
named and no count is claimed.

## Two more decisions worth recording

**1. The queue heading is a skeleton block, not the literal words "Day view".**
A route-segment `loading.tsx` covers its own page *and every descendant segment that has
no closer boundary*. `[organizationId]/loading.tsx` therefore also appears over All cases
(`students/`) and Add a student (`students/new/`). Painting the literal string "Day view"
there would name the wrong route for as long as the skeleton is up. Every existing
`loading.tsx` in the repo (`(app)`, `(focused)`, `(marketing)`) already renders its
heading as a pulse bar for the same reason, so this is the house idiom rather than a new
one. Team and settings *do* carry their real headings, because their boundaries sit on
single-page segments and cannot appear anywhere else — which is exactly what spec §5's
"skeleton only their content" asks for.

**2. Recorded residual, deliberately not fixed here.** `settings/` and `students/new/`
have no error boundary of their own, so an unhandled throw in either is caught by
`[organizationId]/error.tsx` and reads "We couldn't load this queue". Neither page can
reach that boundary through its *known* failures — both already catch `lookup-failed`
themselves and render their own outage card — so this is the unhandled-throw tail only.
Spec §5 enumerates exactly three error surfaces (queue, case, team) and this slice builds
exactly those; widening to per-page copy for every workspace route belongs to the full
§7 PR 8 state gate, not here.

## The fence (what this slice deliberately does NOT touch)

- **Nothing under `components/workspace/`.** That surface belongs to MV-183, building in
  parallel. This slice is route-segment boundary files only.
- No change to `app/(app)/loading.tsx` or `app/(app)/error.tsx` beyond leaving them as the
  student variant they already are — spec §6's "split" is achieved by *adding* the
  workspace variants, not by editing the student ones.
- No change to any page's own outage cards (`QueueFailedCard`, `TeamLookupFailedCard`,
  `CaseRouteOutage`, `OrgShellOutage`). Those handle *known* failures and already carry
  the honest semantics; the new `error.tsx` files catch the *unhandled* throw beneath them.
- No new design tokens, no spinner, no staggered row animation, no permission logic.

## Acceptance criteria

1. Queue loading renders a heading block, a workload-summary skeleton, a toolbar skeleton,
   and **exactly eight** row skeletons.
2. Case loading renders a case-header skeleton, the section rail, and exactly two content
   panels.
3. Team and settings loading sit under `[organizationId]/`, so the consultancy shell (top
   bar + org rail) stays mounted, and neither re-renders that chrome itself.
4. No workspace skeleton contains a spinner, and no skeleton element carries a per-row
   animation delay.
5. Every workspace skeleton animates only through the shared `animate-pulse` utility, which
   `app/globals.css`'s `prefers-reduced-motion: reduce` block neutralises — no inline or
   bespoke animation escapes that guard.
6. Each error boundary renders its exact spec copy, exposes a working Retry that calls
   `reset`, and makes **no** empty-state claim (a failed queue never says "no cases").
7. `lookup-failed` still presents as an outage and never as a permission denial: no
   workspace boundary uses denial vocabulary, and the pages' existing `lookup-failed`
   behaviour is unchanged.
8. The student-route loading/error regression suite (`tests/app/error-boundaries.test.tsx`)
   stays green with no assertion weakened.
9. Gate green (`typecheck` / `lint` / `test`) and a live browser pass at 1280 and 375.

## Test plan

`tests/app/workspace-boundaries.test.tsx` — new file, rendering each default export
directly (these are plain components; Next's mounting is verified in the browser, not in
jsdom):

- queue loading: heading block present, summary skeleton present, toolbar skeleton present,
  row skeletons `=== 8` (an exact count, so deleting or duplicating rows fails);
- case loading: header skeleton, section rail, panel count `=== 2`;
- team + settings loading: their real heading text, a content skeleton, and **no**
  `WorkspaceTopBar` / `OrgRail` duplicate;
- every loading file: `aria-busy="true"`, `aria-live="polite"`, an `sr-only` "Loading…";
- no-spinner: no `role="progressbar"`, no `animate-spin`, no class containing `spin`;
- no-stagger: no element with an `animation-delay` inline style or a `delay-*` class;
- reduced motion: a source scan proves `app/globals.css` still neutralises
  `animation-duration` under `prefers-reduced-motion: reduce`, and that no workspace
  boundary file declares its own `animation`/`@keyframes`/`style={{…animation…}}`;
- each error boundary: exact copy, `reset` called once on Retry, and
  `queryByText(/no cases|nothing needs action|no cases yet/i)` is null;
- denial vocabulary: no boundary renders "permission", "not allowed", "forbidden",
  "denied", or "does not exist".

All source-scanning assertions split on `/\r?\n/` — this is a Windows CRLF working tree and
splitting on `"\n"` makes line assertions vacuously true (MISTAKES.md).

## Resume notes (for a cold agent)

- Branch `mv-184-workspace-boundaries` off `origin/master` (`4f59df7`).
- Reference for idiom: `app/(app)/loading.tsx` (pulse bars + `Card` blocks + `aria-busy`)
  and `app/(app)/error.tsx` (client boundary, `useEffect` console.error, pill Retry).
- Copy sources already in the tree, matched verbatim so wording cannot drift:
  `QueueFailedCard` in `app/(app)/workspace/[organizationId]/page.tsx`,
  `TeamLookupFailedCard` in `.../team/page.tsx`, and `CaseRouteOutage` in
  `components/workspace/case-route-outage.tsx`.
- **Do not reconcile `board.json` against unfamiliar cards.** MV-183 is building in a
  parallel worktree and appends its own row; the union at merge is append-only.
- Browser pass is mandatory (jsdom has no layout engine and has twice let visibly broken
  layout ship here). Force a slow load with a temporary `await new Promise(r =>
  setTimeout(r, 8000))` at the top of the page you want to observe, screenshot, then revert.

---

## Evidence (2026-08-19/20, branch `mv-184-workspace-boundaries`)

**Gate green.** `npm run typecheck` clean · `npm run lint` clean · `npm test` **3502 passed
/ 370 files**, exit 0 (master baseline 3465 / 369 → +37 tests, +1 file). The known Windows
flake `no-actor-equals-student > M4b` did not fire on either full run.

**Assertions shown to bite** (mutation pass, all reverted): eight rows → seven fails the
count test; two panels → one fails the panel test; the queue heading → "No cases yet" fails
both the copy test and the empty-claim test; the team outage copy → "You may not have
permission…" fails the denial-vocabulary test and the on-our-side test; the grid-parity test
failed first on a wrong selector before passing.

**Live browser pass** — local Docker Supabase stack (`127.0.0.1:54321`, never production),
a seeded `Himalaya Education Consultancy` org with twelve cases, dev sign-in harness,
Next 16.2.7 dev server. States forced with a temporary 25 s delay (loading) and a temporary
`throw` (error), all instrumentation reverted; `grep -rn "MV-184 TEMP" app/` returns nothing.

| State | Result |
|---|---|
| Queue loading | shell preserved; heading block, summary card, toolbar, eight rows on the 1120 column |
| Case frame loading (cold entry) | frame silhouette — header band + hairline, rail, two panels; **no** queue rows |
| Case section loading | real frame stays mounted (name, pills, rail with Overview current); only the content column skeletons |
| Team loading | shell + real "Team" heading; roster skeletoned |
| Settings loading | shell + real "Organization settings" heading; form skeletoned |
| Queue error | shell preserved; "We couldn't load this queue", Retry, no empty-case claim |
| Case error | shell **and** frame preserved, incl. the way back to Day view; "We couldn't load this student", Retry |
| Team error | shell + "Team" heading preserved; "We couldn't load the team", Retry |

Server log confirms each boundary caught its **own** segment rather than a parent's:
`[workspace] queue route error`, `[workspace] case route error`, `[workspace] team route error`.

**The 375 screenshot could not be captured in this environment, and is not claimed.** The
in-app Browser pane cannot composite headlessly (every element rect reads 0), Chrome's
window was maximized and the extension's `resize_window` is a no-op against it (measured:
`innerWidth` stayed 2327 across three attempts), page-zoom shortcuts are blocked, and
`X-Frame-Options: DENY` rules out an iframe harness. Mobile correctness is instead pinned by
two things that cannot rot: the **grid-parity test** against `[caseId]/layout.tsx` — whose
responsive behaviour is already shipped and browser-verified — and the fact that **no other
file in this slice declares a breakpoint at all** (verified: `md:` appears only in
`students/loading.tsx`). A 375 visual is worth taking at the §7 PR 8 density gate, on a
machine where a viewport can actually be set.

## Post-review fixes (2026-08-20)

A 14-agent adversarial review of PR #150 confirmed two defects that the green suite could
not see. Both are fixed on this branch; both now have a guard that FAILS when the fix is
removed (verified by reverting each and re-running — 3 tests went red, named below).

### 1. The §6 split never reached the workspace segment

The slice added a skeleton at `[organizationId]/loading.tsx`, but a segment's `loading.tsx`
is mounted INSIDE that segment's own layout — so it could not cover `[organizationId]/layout.tsx`'s
own read, and nothing covered `workspace/layout.tsx`'s. Both layouts are `async` and await
Supabase, so the nearest fallback for both was `app/(app)/loading.tsx`: the STUDENT dashboard
silhouette (`max-w-[1120px]`, `lg:grid-cols-[1.5fr_1fr]`). Every cold entry to a queue painted
the student shell first — the exact mismatch this card exists to remove.

Two halves, because one file could not fix it:

- **`app/(app)/workspace/loading.tsx`** (new) — the workspace's own fallback: organization
  band + neutral content, naming no route, redrawing no chrome.
- **`app/(app)/workspace/layout.tsx`** — no longer `async`. The auth read moved behind a
  `Suspense` whose fallback is the same bar with no user pill, so the layout returns
  immediately and the fallback above it is never reached.

Guard: *"lets the layout above it render without awaiting, or the fallback never shows"* —
red when the layout is restored to `export default async function`.

### 2. "Try again" did not try again

All three new boundaries wired retry to `reset()` alone. `reset()` re-renders the subtree
from the router cache; these boundaries guard SERVER components, whose output IS that cache,
so the same failed payload replays and the button visibly does nothing — for exactly the
transient outage the copy promises to recover from. Pre-existing in `app/(app)/error.tsx` too.

Fixed via **`components/layout/use-route-retry.ts`**: one hook, `router.refresh()` then
`reset()` inside a single `startTransition`. Adopted by all three workspace boundaries and by
`app/(app)/error.tsx`. It is shared rather than copied four times because the difference
between a retry that works and a retry that lies is one invisible line.

Guards: *"refreshes the route as well as resetting the %s boundary"* (behavioural, all three),
*"wires %s through the shared retry, not bare reset"* (source scan, all four), and
*"re-runs the failed server read, not just the boundary"* for the student boundary.

### Gate

`npm run typecheck` 0 · `npm run lint` 0 · `npm test` **3518 passed / 370 files, 0 failed**.

### Known, deliberately not fixed here

- `app/(focused)/error.tsx` and `app/(marketing)/error.tsx` have the same bare-`reset()`
  defect. They are outside this slice's scope; the `(focused)` one guards the anonymous
  results surface, so it is worth its own card.
- `[organizationId]/error.tsx` says "We couldn't load this queue" but is also the nearest
  boundary for `settings/`, `students/new`, and case-frame layout throws — it names the wrong
  surface on three routes. Review-confirmed, left open by scope decision.
