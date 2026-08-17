# MV-181 — Case-frame refit: persistent context, decision-strip slot, manage-inside-frame

**Priority:** P1 · **Owner:** agent · **Created:** 2026-08-17

## Why

Slice ③ of the workspace UI lane. MV-172 (PR #143) already built the case routes and `components/workspace/case-workspace-shell.tsx` — this card is the DELTA between what exists and the spec's persistent-context contract, NOT a from-scratch build (preamble amendment 1). Verify against the merged #143 tree before scoping work; re-building what exists is the MISTAKES.md top process error.

**Spec:** `docs/superpowers/specs/2026-08-17-consultancy-workspace-ui.md` §1 (persistent case context, return behavior) + §3 (case detail zones) + §4 inventory.

## Scope (as a delta)

- Align the existing case shell with the spec's frame: back-to-day-view link, display name, email/none, linkage marker, status pill, `StaffReference` assignee, case-section nav (sticky rail desktop / scrollable row mobile).
- Case overview composes: decision-strip slot (renders NOTHING until judgement/Stage 4 ship — no placeholder), single next-action panel (same resolution helper as MV-179), operational rail.
- Unlinked-case overview leads with the invite-the-student block (text only until Stage 5 — no dead controls); linked case drops it entirely.
- Refit `/manage` as "Case details" inside the persistent frame — keep URL, mutation logic, and error semantics.
- Queue rows and new-case success navigate to the case overview.
- Every nested page re-authorizes independently (reassignment mid-session must bite at the next boundary).

## Acceptance criteria

1. Case header + section nav persist across every case subroute; active section is marked; back link always targets the Day view.
2. Zero dead links: Documents/Visa read/Activity nav entries absent until their routes ship.
3. Unlinked vs linked states render per spec §3 (abstention-style empties, never zero scores, no raw `student_user_id`).
4. Manage keeps its explicit reassignment-conflict and left-unassigned errors inside the new frame.
5. Gate green + browser pass: queue → case → section → back.

## Test plan

Per spec §7 PR 3, adjusted for the refit: route tests owner/admin all-case + counsellor assigned-case; cross-org/unassigned/missing/lookup-failed stay distinguishable; persistent-header and active-link tests; #143's existing case-route test suite stays green.

---

## Evidence (2026-08-18, branch `mv-181-case-frame-refit`)

**Gate:** `npm test` 3394 passed / 365 files · `npm run typecheck` clean · `npm run lint` clean.
No database evidence is claimed from this machine — there is no local Supabase stack here, and the slice ships no SQL. The gating CI `integration` job covers the DB side.

### What shipped — the delta only

| Concern | Where |
|---|---|
| Persistent case frame | `app/(app)/workspace/[organizationId]/students/[caseId]/layout.tsx` (new) |
| Case identity + status + assignee | `components/workspace/case-context-header.tsx` (new) |
| Section nav, sticky rail / scrolling row | `components/workspace/case-section-nav.tsx` (new, the one client boundary) |
| Decision-strip slot | `components/workspace/case-decision-strip.tsx` (new; returns `null`) |
| One next action | `components/workspace/case-next-action.tsx` (new) |
| Unlinked-case prompt | `components/workspace/case-invite-block.tsx` (new) |
| Assignee + plan reads for the frame | `lib/cases/case-frame.ts` (new) |
| Gate carries `grantedRoles` + `scope` | `lib/cases/case-route.ts` |
| `resolveNextAction` takes a narrower input; `dependsOnPlan` | `lib/cases/queue.ts` |
| Case overview rebuilt to spec §3's three zones | `.../students/[caseId]/page.tsx` |
| `/manage` refit as "Case details" inside the frame | `.../students/[caseId]/manage/page.tsx` |
| Six case pages drop their own shell | `profile`, `matches`, `plan`, `checklist{,/all,/[programId]}` |
| Outage extracted; back link retargeted | `components/workspace/case-route-outage.tsx` (replaces `case-workspace-shell.tsx`, deleted) |
| New-case success opens the case | `components/workspace/case-create-form.tsx` |
| Linkage marker aligned with its own filter | `components/workspace/case-link-state.tsx` + the All-cases legend |

**MV-172 was not rebuilt.** The gate (`openCaseRoute`), the seven routes, the case-aware panels and the `CaseScopeProvider` contract are unchanged; what moved is where the chrome renders and what the overview says.

### Acceptance criteria

1. **The frame persists and marks where you are.** `tests/app/case-frame.test.tsx` (27 tests) drives the real layout against a fake database: all six spec §1 header items, the six section links, `aria-current` on the selected segment and on the overview when no segment is selected, and `checklist` staying marked from its nested routes. Because it is a layout, Next.js keeps it mounted across sibling navigations — the live pass below confirms the rail stays put while the header scrolls away.
2. **Zero dead links.** The nav is built from the routes that exist; mutation M6 (adding a Documents entry) fails the "publishes no link to a route that has not shipped" test, which names Documents, Visa read, Activity and Assessment.
3. **Unlinked vs linked per spec §3.** `tests/app/case-overview.test.tsx` (21 tests): the unlinked case leads with the invitation and gets no control that does nothing (no button, no `/invite/` link); the linked case drops the block entirely; no `student_user_id` reaches the markup; the decision strip renders no verdict word and no "Coming soon".
4. **Case details keeps its error semantics.** `tests/app/case-pages.test.tsx` is unchanged on every reassignment-conflict, left-unassigned, mixed-`lookup-failed`, archived and roster-withholding assertion — only the two that asserted the page's own duplicate heading moved, and both facts are now proven on the frame instead.
5. **Gate green + live pass** below.

### The honesty work this slice added

Three reads can make the overview's answer untrue, and each leaves exactly the shape of the benign answer:

| Failure | Naive rendering | What it does |
|---|---|---|
| `case_assignments` read fails | "Unassigned" | "We couldn't check who is assigned" — and for an owner/admin, the next action becomes "We couldn't work out the next action" rather than "Assign a counsellor" |
| `organization_memberships` read fails | a confident active `Counsellor · 7f3c9a1e` | the whole reference collapses to unknown — a half-true reference is the one a reader acts on |
| `plan_items` read fails | "Open the case" | uncertain **only** when the resolution reached the plan (`dependsOnPlan`), so "Review the case" still shows |

The guard narrows to the viewer: a counsellor never reaches the assignment step, so a failed assignment read costs them nothing (mutation M9 proves the guard does not over-report).

### Mutation tests — 15 applied, 15 caught

| Mutation | Result |
|---|---|
| M1 `withheld` removed — the frame reads who staffs the case for the linked student | 2 fail |
| M2 a failed membership read becomes a confident active reference | 1 fail |
| M3 a failed assignment read becomes "unassigned" | 2 fail |
| M4 back link points at All cases again | 1 fail |
| M5 the section nav stops marking where you are | 3 fail |
| M6 a dead Documents link is published | 1 fail |
| M7 the frame renders section content it could not establish a case for | 1 fail |
| M8 the uncertainty guard removed | 2 fail |
| M9 the uncertainty guard over-reports | 2 fail |
| M10 the decision strip ships a "Coming soon" placeholder | 1 fail |
| M11 the unlinked case gets an invitation button that does nothing | 1 fail |
| M12 the linkage marker is inverted | 3 fail |
| M13 a counsellor is asked to assign, which they may not do | 2 fail |
| M14 the create form returns to the list instead of the new case | 1 fail |
| M15 Case details repeats the name the frame already carries | 2 fail |

### Live browser pass

No Supabase credentials on this machine, so a temporary harness (`app/mv181-harness/**`, **deleted before committing**) rendered the real `WorkspaceTopBar` / `OrgRail` / `CaseContextHeader` / `CaseSectionNav` / `CaseInviteBlock` / `CaseNextAction` and the operations rail, with a child route so `useSelectedLayoutSegment()` had a real segment to mark. Each theme was measured on a **fresh load**, never a runtime `data-theme` flip (MISTAKES.md: testing).

| Measurement | 1280×720 | 375×812 |
|---|---|---|
| Horizontal page overflow | **none** (`scrollWidth == clientWidth`) | **none** (375 == 375) |
| `position: fixed` elements | **0** | **0** — no second bottom bar |
| Section nav | sticky vertical rail, 184px, `flex-direction: column`, right border | horizontal row that scrolls **inside itself** (554 > 375), bottom border |
| Chrome heights | top bar 67 · org band 59 · case context 174 · rail content 300 | top bar 67 · org band 119 · case context 196 · nav 55 |
| Overview columns | next action 612px + operations 260px, right edges aligned at the 1120 gutter | stacked, next action first |

- **Sticky proven, not assumed:** after `scrollTo(0, 900)` the case header's top is at −774 while the rail holds at +16 (`md:top-4`).
- **Alignment:** the rail's link text and the student's name both start at x=95 — the `md:px-2` on the list exists for that and is commented as such.
- **Active marking live:** on `/…/plan` exactly one link carries `aria-current` and it is Plan.
- **Contrast, fresh load in each theme** (alpha tints composited over their real backdrop):

| Element | Light | Dark |
|---|---|---|
| Section nav, active | **7.78:1** | **5.93:1** |
| Section nav, idle | 6.79:1 | 7.45:1 |
| "← Day view" | 8.88:1 | 7.03:1 |
| Email / student name | 6.79:1 / 15.10:1 | 7.45:1 / 15.13:1 |
| Operations labels (11px) | 5.38:1 | 5.30:1 |

All pass WCAG AA. Console errors during the pass were only the marketing route's missing Supabase env — none from the case routes.

### The carried-forward MV-180 deviation: measured, and declined

MV-180 deferred "make the org rail vertical above `md`" to this slice, on the grounds that it needs an owned content grid. This slice **does** build an owned grid — but at the `[caseId]` level, whose children are only case pages, so no other workspace route had to move.

Taking the org rail vertical is a different, larger migration, and it was measured rather than argued. The real `CaseQueueTable` with five seeded rows and the assignee column, at three content widths:

| Content column | Table needs | Result |
|---|---|---|
| 1080px — today | 1062px | fits; every row **64px** |
| 896px — one vertical rail | 1004px | **scrolls sideways**; rows grow to **79px** |
| 712px — two rails (org + case sections) | 1004px | **scrolls sideways**; rows grow to **79px** |

Spec §2 asks for 56–64px rows and no horizontal scroll on the queue, so a vertical org rail trades the Day view — the product's primary surface, shipped and measured six days ago — for a rail orientation. Widening the shell past `max-w-[1120px]` would buy the room back, but that is a whole-app decision, not a side effect of a case-frame slice. **The rail stays horizontal; the deviation stays open** and the numbers are recorded in `components/workspace/org-rail.tsx` so the next attempt starts from evidence.

### Other deviations, recorded rather than silent

1. **The linkage marker's word changed: "Self-reported" → "Student linked"** (`case-link-state.tsx`, and the All-cases legend beneath the table). Spec §1 item 4 and §3 both name "Student linked", and the queue's own link-state **filter** has always been labelled "Student linked" (`case-queue-toolbar.tsx`) — so a counsellor filtered by one word and read another back. F-3's caveat is not lost: it is the pill's `title`, the legend sentence, and now a visible line in the case frame ("Name and email may be self-reported.") next to the two fields it qualifies.
2. **The frame and each page gate separately** — two `case.read` checks and two case reads per case page load. That is the price of "the layout renders persistent context AND every nested page reauthorizes" (spec §1, §5): Next.js does not re-render a layout when navigating between its children, so the page's gate is the one that bites after a mid-session reassignment. `React.cache()` would dedupe them within a request; nothing in this repo uses it yet, and the extra round trips buy each segment's gate staying legible as its own decision. Worth revisiting if case pages get slow.
3. **The next-action CTA is omitted where no destination is determined** ("Waiting on student", "Open the case", a closed case) rather than inventing one. Spec §3 says the panel "includes one CTA"; a button to nowhere is the thing this slice spent most of its care avoiding.

### Follow-ups found, not fixed here

- **Route-segment `loading.tsx` for the case segment** (spec §5) is not added — spec §7 gives loading/error boundaries to PR 8, and this card's scope does not list them.
- The org-rail verticalization above, if the shell is ever widened past 1120px.
- Still true from MV-180 and untouched here: nothing links a signed-in student to `/workspace`; workspace pages render a `<header>` inside `<main>`; `components/layout/logo.tsx` still reads "MyVisa".

## Resume notes

Branch `mv-181-case-frame-refit` off master at `7f3aabb`. Board commit first, then the refit. Next in the UI lane: the stage-gated slices (spec §7 PRs 5–8) ride Stage 4 / Stage 5 / judgement — the decision strip's two panels have a reserved home in `case-decision-strip.tsx` and neither needs to relitigate where the answer goes.
