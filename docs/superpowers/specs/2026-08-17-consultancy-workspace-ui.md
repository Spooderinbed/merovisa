# Consultancy workspace UI â€” design spec

**Date:** 2026-08-17 Â· **Status:** adopted (founder-directed lane) Â· **Provenance:** authored by Codex (`gpt-5.6-sol`, xhigh reasoning, read-only repo access) against master `ede20ee`, triangulated and amended by Claude. The unamended body begins at "## 0. Repository findings and corrections".

## Amendments from triangulation (read these first â€” they override the body where they conflict)

1. **Codex consulted BEFORE MV-172 (PR #143) merged and never saw it.** MV-172 already delivers most of the body's PR 3 and nearly all of PR 4: the explicit case routes (`students/[caseId]` overview + `/profile`, `/matches`, `/plan`, `/checklist/**`), `components/workspace/case-workspace-shell.tsx`, the case-aware `components/case-experience/*` panels, `lib/cases/case-route.ts`, and the seven case-aware write routes. Therefore:
   - **PR 4 ("case-aware student domains") is DONE** â€” treat it as a verification pass inside other slices, not a slice.
   - **PR 3 ("persistent case frame") is a REFIT delta**: align the existing `case-workspace-shell` with Â§1's persistent-context contract (header contents, section nav, decision-strip slot, manage-inside-frame), not a from-scratch build.
2. **Adjusted build order** (each slice is one card, one PR): â‘  queue-first Day view (body PR 1) â†’ â‘¡ consultancy shell split + team-access correction (body PR 2) â†’ â‘¢ case-frame refit (body PR 3 as delta) â†’ then the stage-gated slices (body PRs 5â€“8) ride Stage 4 / Stage 5 / judgement cards when those stages open.
3. **The team-page access bug Codex found is real and rides slice â‘¡:** the current team page gates a counsellor's matrix-permitted read-only view behind `org.manage` (access-matrix cell 4 vs cell 5).
4. Body Â§0's stack corrections stand (Next 16 / React 19 / Tailwind v4 tokens in `app/globals.css` `@theme` â€” add no new tokens). Where the body says a route "does not exist as written", prefer the tree that exists on master after #143.

---
# MeroVisa consultancy workspace UI specification

## 0. Repository findings and corrections

- The repository uses Next.js `16.2.7` and React `19.2.4`, not Next.js 14; implementation must follow the installed asynchronous `params` and `searchParams` conventions.
- Tailwind is v4 and the design tokens live in `app/globals.css` under `@theme`; there is no `tailwind.config.ts`, so that constraint must be interpreted as “reuse the existing tokens and add no new ones.”
- The implemented workspace routes include `[organizationId]`; the brief’s shortened page paths do not exist as written.
- The current team page contradicts access-matrix cell 4 by requiring `org.manage`, which prevents counsellors from receiving their permitted read-only team view.
- Neither `cases` nor `plan_items` contains a due date or deadline, so an “Overdue” view, overdue count, or deadline sort would fabricate information and must not render until a separately approved data contract exists.
- A next action can be derived today from linkage, operational status, assignment state, and `selectNextStep(plan_items)`; it should not become a new stored field in this UI slice.
- The judgement result has no schema or mutation permission yet, so this specification reserves its presentation location but does not define who may generate or rerun it.

## 1. Navigation model

### Signed-in shells

Refactor `app/(app)/layout.tsx` into a neutral authenticated shell with separate student and consultancy layouts whose route groups do not change public URLs.

- The student shell retains `AppBar`, `JourneyMarker`, `MobileTabBar`, and the student footer.
- The consultancy shell uses a workspace top bar and organization rail; it must not show the student journey marker, “My plan” navigation, or student mobile tabs.
- The workspace top bar contains the MeroVisa mark, current organization, “Switch organization,” and the existing user affordance.
- The organization rail contains Day view, All cases, Team, and owner-only Settings.
- “Add a student” appears as an owner/admin action, not as a counsellor action.
- The organization rail becomes a compact horizontal link row below `md`; do not add a second fixed bottom bar.

This separation is required because the current signed-in chrome describes the actor as a student even while they are processing consultancy cases.

### Route tree

```text
/workspace
  Organization chooser, or redirect when exactly one active membership exists

/workspace/[organizationId]
  Day view: the action-first queue

/workspace/[organizationId]/students
  All cases: searchable directory

/workspace/[organizationId]/students/new
  Create an unlinked case; owner/admin only

/workspace/[organizationId]/students/[caseId]
  Case overview

/workspace/[organizationId]/students/[caseId]/profile
/workspace/[organizationId]/students/[caseId]/assessment
/workspace/[organizationId]/students/[caseId]/matches
/workspace/[organizationId]/students/[caseId]/plan
/workspace/[organizationId]/students/[caseId]/documents
/workspace/[organizationId]/students/[caseId]/visa-read
/workspace/[organizationId]/students/[caseId]/activity
/workspace/[organizationId]/students/[caseId]/manage

/workspace/[organizationId]/team
/workspace/[organizationId]/settings
```

- Keep `organizationId`, rather than changing to the roadmap’s proposed slug, because all current authorization paths and links already use the ID.
- Render Documents, Visa read, and Activity navigation only when their routes ship; never publish dead “Coming soon” links.
- Keep `/manage` as the canonical “Case details” route so the existing route and APIs survive.
- Make the case overview the default target from every queue row.
- `/workspace` redirects directly to the Day view when the actor has one active organization and remains a chooser when they have more than one.
- A zero-organization actor remains at `/workspace` with the existing honest empty state.

### Persistent case context

Add `app/.../students/[caseId]/layout.tsx` as the persistent case frame.

The frame contains:

1. A “Back to day view” link.
2. Student display name.
3. Email, or “No email address on file.”
4. A word-based linkage marker: “Student linked” or “No student account.”
5. Operational-status pill.
6. Primary assignee as `Role · 8-character id`, “Unassigned,” or “Access switched off · Role · id.”
7. Case-section navigation.

On desktop, the section navigation is a narrow sticky rail beside the case content; on smaller screens it becomes a horizontally scrollable row of ordinary links.

Every nested page must reauthorize the actor independently even though the layout renders persistent context, because a counsellor can be reassigned while the layout remains mounted.

### Return behavior

- “Back to day view” always links to `/workspace/[organizationId]`.
- Browser Back returns to the exact prior filters because queue state lives in the URL.
- Do not add a global selected-case or impersonation state.
- Do not carry an encoded return URL through every case subroute.

### URL and keyboard addressability

Queue state uses query parameters:

```text
?view=needs-action
&q=rai
&status=ready_for_review
&link=unlinked
&assignee=[membershipId]
&sort=attention
```

Supported interactions:

- `/` focuses queue search unless focus is already inside a control.
- `j` and `k` move focus between visible case links.
- `Enter` follows the focused case link.
- `Escape` clears search focus but does not silently remove active filters.
- Native Tab navigation remains complete; shortcuts are additive and must not create an ARIA grid.
- Case names are ordinary `<Link>` elements, and rows must not rely on click handlers for navigation.

A single small `case-queue-shortcuts.tsx` client component may own these shortcuts; the queue, filters, and pages remain Server Components.

## 2. Day view

### Page anatomy

The organization landing page contains, in order:

1. Page heading: “Day view.”
2. Compact workload summary.
3. Queue view tabs and filters.
4. Dense semantic table.
5. Cap or empty-state messages when applicable.

Use the existing `max-w-[1120px]`, paper background, flat surfaces, thin borders, and existing type tokens; do not animate or stagger forty rows.

### Workload summary

Use a single bordered strip of text counts rather than cards or charts.

For owner/admin:

```text
All 40 · Needs action 14 · Waiting on student 9 · Ready for review 4 · Needs assignment 3
```

Below or beside it, show workload by active assignee:

```text
Owner · a13f829c  8
Counsellor · b9921fd0  14
Counsellor · 77ac340e  15
Needs assignment  3
```

For counsellors:

```text
Assigned 40 · Needs action 12 · Waiting on student 8 · Ready for review 3
```

“Needs assignment” includes both cases with no primary assignment and cases whose assigned membership is inactive.

### Queue membership

- Owner and admin queues contain every visible non-archived organization case.
- Counsellor queues contain assigned cases only.
- Closed cases are omitted from the default Day view but remain available through All cases.
- Archived cases appear only in All cases unless an explicit archived filter is selected.
- The default Day view is `view=needs-action&sort=attention`, with those defaults omitted from the canonical URL.

### Current and future columns

| Column | Contents | Availability |
|---|---|---|
| Student | Display name link, email on the second line, linked/unlinked marker | Current |
| Visa read | Strong, Possible, Reach, or neutral “Not available” | Judgement stage |
| Lodgement | Read word plus the single blocking item | Stage 4 |
| Next action | One concise action or waiting state | Current, enriched later |
| Status | Sentence-case operational status | Current |
| Assignee | Role plus truncated id; hidden for counsellors | Current |
| Updated | Short date from `cases.updated_at`, with full timestamp accessible | Current |

Before judgement and Stage 4 ship, omit their columns entirely rather than filling forty rows with “Coming soon.”

### Next-action resolution

Resolve one visible action per row in this order:

1. Archived or closed: no action.
2. No active assignee, for owner/admin: “Assign a counsellor.”
3. `ready_for_review`: “Review the case.”
4. Unlinked with email: “Invite the student.”
5. Unlinked without email: “Add an email to invite.”
6. A named judgement or document blocking item: show that single item.
7. `selectNextStep(planItems).state === "next"`: show the selected plan-item title.
8. `waiting_on_student`: “Waiting on student.”
9. `selectNextStep(...).state === "waiting"`: “Plan items underway.”
10. Otherwise: “Open the case.”

Invitation actions become links only when Stage 5 exists; before then the linkage marker remains visible without a dead control.

### Attention sort

Use a pure, deterministic priority helper:

1. Needs an active assignee.
2. Ready for review.
3. Unlinked.
4. Has a named blocking item.
5. New.
6. Has a plan-derived actionable item.
7. In progress without an actionable item.
8. Waiting on student.
9. Closed.
10. Archived.

Within a tier, sort by `updated_at` oldest first, then `display_name`, then case ID.

“Updated” is only a neglect tie-breaker and must never be labelled or interpreted as a deadline.

### Views and facets

- Views: Needs action, All, Waiting on student, Ready for review, Needs assignment for owner/admin.
- Search: case-insensitive display name or email using the existing safe in-memory matching behavior.
- Status: the five existing `OPERATIONAL_STATUSES`.
- Link state: Any, Student linked, No student account.
- Assignee: Any, Needs assignment, and active membership references; omit for counsellors.
- Sort: Needs action first, Name, Recently updated.
- Filters remain a native GET form with Apply and Clear.
- Counts and results always respect the actor’s authorization scope.
- Do not render an Overdue view, count, column, filter, or empty state with the current data model.

### Density and responsive behavior

- Desktop rows target 56–64px, with a single divider and no surrounding card.
- Long next actions and blocking items truncate to one line with the full text available to assistive technology and on title/focus.
- At smaller widths, each row becomes a flat two- or three-line block separated by borders; it must not become the current large-card treatment.
- Keep the case name and next action visible before lower-priority metadata.
- Use words as well as color for every status and verdict.
- Preserve the existing 500-row cap warning; when truncated, do not claim that the attention order covers the complete organization.

### Empty states

Owner/admin with zero cases:

> No cases yet  
> Add the first student to start this organization’s work queue.

Show the existing “Add a student” action.

Counsellor with zero assigned cases:

> No cases assigned  
> An owner or admin needs to assign a student before they appear here.

Do not show an Add action.

No cases need action:

> Nothing needs action right now  
> Waiting and closed cases remain available in All cases.

Filtered empty:

> No cases match those filters  
> Clear the filters to return to the current queue.

## 3. Case detail page

### Layout zones

The case overview uses three zones beneath the persistent header:

1. Decision strip: visa-risk read and submittability read.
2. Primary work area: single next action and current case summary.
3. Operational rail: status, assignment, linkage, and case details.

At desktop widths, the primary work area is wider than the operational rail; at smaller widths they stack in that order.

### Decision strip

The decision strip is the first content region because it contains the product’s differentiating answers.

#### Visa-risk read

The panel contains:

- Label: “Visa read.”
- Strong, Possible, or Reach word band using `VerdictPill`.
- One-sentence conclusion.
- “Blocking item” when one exists.
- Five sentence rows: financial capacity, source-of-funds credibility, English visa floor versus course threshold, gap justification, and prior refusals.
- Source or freshness copy when the judgement implementation supplies it.

Do not use a score, radial chart, gauge, or decorative factor bars.

#### Submittability read

The panel contains:

- Label: “Lodgement.”
- A word state such as “Ready to lodge,” “Needs review,” or “Blocked.”
- The single item preventing lodgement, when one exists.
- A link to Documents.
- No completion percentage unless Stage 4 establishes a truthful denominator.

Use Strong color for ready, Possible color for needs review, and Reach color for blocked, always accompanied by the state word.

Until each feature ships, `case-decision-strip.tsx` returns no visible placeholder; once shipped, it always occupies the first overview region.

### Next action

`case-next-action.tsx` displays exactly one primary action, following the same resolution as the queue.

- It uses a flat primary-tint or primary surface, not a shadowed feature card.
- It includes one CTA and at most one supporting sentence.
- It never lists a general task backlog; the Plan route owns that detail.
- For an unlinked case, invitation replaces all scoring prompts as the primary action.

### Unlinked case

The case header shows “No student account.”

The overview begins with:

> Invite the student  
> Link their account before relying on a student-entered profile or visa read.

- With an email, show “Invite student” when Stage 5 ships.
- Without an email, show “Add email to invite.”
- Visa read shows no verdict after that feature ships; its honest state is “Not available — no linked student profile.”
- Program or assessment surfaces that lack sufficient data render their existing abstention-style empty states rather than zero or Reach.
- Staff may still access permitted operational, plan, and document sections.

### Linked case

The case header shows “Student linked,” followed by “Name and email may be self-reported.”

- Display profile, assessment, matches, plan, documents, and judgement data only when each read succeeds.
- Missing data is “Not completed” or “No data yet,” never a zero score.
- The invitation action disappears completely.
- Student linkage does not expose the raw `student_user_id`.

### Manage route

Refit the current manage page as the Case details section inside the persistent case layout.

- Keep operational-status mutation for owner, admin, and assigned counsellor.
- Keep assignment mutation for owner/admin only.
- Keep archived cases read-only until the archive stage provides a reversible flow.
- Use `StaffReference` consistently for the current assignee and picker options.
- Preserve the current explicit reassignment-conflict and left-unassigned errors.

## 4. Component inventory

| File/component | Purpose | Data needs | Reuse |
|---|---|---|---|
| `workspace-shell.tsx` / `WorkspaceShell` | Consultancy-only chrome and organization rail | Organization id, name, slug, actor role | New |
| `workspace-nav.tsx` / `WorkspaceNav` | Role-aware organization navigation | Organization id; booleans for create, team management, settings | New |
| `organization-switcher.tsx` / `OrganizationSwitcher` | Switch organizations without losing tenant clarity | Existing actor organizations | Refit `/workspace` organization cards |
| `workload-summary.tsx` / `WorkloadSummary` | Compact status and assignee counts | Cases, assignments, membership role/status | New |
| `case-queue-toolbar.tsx` / `CaseQueueToolbar` | GET filters, views, and sorting | Query values, status vocabulary, membership ids and references | Refit current students filter form |
| `case-queue-table.tsx` / `CaseQueueTable` | Semantic dense queue | Queue rows and viewer role | New |
| `case-queue-row.tsx` / `CaseQueueRow` | One keyboard-addressable case summary | Case fields, derived next action, assignment, future reads | New; retires `StudentRow` |
| `case-queue-shortcuts.tsx` / `CaseQueueShortcuts` | `/`, `j`, `k`, and Enter behavior | Visible case-link element ids only | New client boundary |
| `case-status-pill.tsx` / `CaseStatusPill` | Operational status word pill | Existing operational status | New; do not misuse `VerdictPill` |
| `case-link-state.tsx` / `CaseLinkState` | Linked/unlinked marker and explanatory copy | `hasLinkedStudent` | Refit current `Marker` |
| `staff-reference.tsx` / `StaffReference` | Staff identity without unavailable names | Role, truncated user id, active/inactive/self state | New; shared by queue, team, and manage |
| `case-context-header.tsx` / `CaseContextHeader` | Persistent case identity and return path | Existing `OrgCaseDetail`, status, assignment | New |
| `case-section-nav.tsx` / `CaseSectionNav` | Case-local deep links | Organization id, case id, available routes | New |
| `case-overview.tsx` / `CaseOverview` | Composes the decision strip, next action, and operations | Existing case fields plus future named reads | New |
| `case-next-action.tsx` / `CaseNextAction` | Resolves and renders one primary action | Link state, email, status, archive, assignment, selected plan item, future blocker | New |
| `case-decision-strip.tsx` / `CaseDecisionStrip` | Stable home for the two differentiating reads | Judgement read and submittability read | New |
| `visa-risk-panel.tsx` / `VisaRiskPanel` | Visa verdict, blocking item, and five risk statements | Future judgement outputs named in the brief | New; reuse `VerdictPill` |
| `submittability-panel.tsx` / `SubmittabilityPanel` | Lodgeability word and single blocker | Future Stage 4 read and blocking item | New |
| `case-manage-controls.tsx` / `CaseManageControls` | Status and primary-assignment mutations | Existing props and APIs | Keep and split into smaller controls if needed |
| `case-create-form.tsx` / `CaseCreateForm` | Minimum unlinked-case creation | Existing name, optional email, organization id | Keep; redirect successful creation to case overview |
| `team-member-row.tsx` / `TeamMemberRow` | Role/status row using staff reference | Existing membership fields | Refit into a dense row |
| `card.tsx`, `button.tsx`, `input.tsx` | Base surfaces and controls | Existing props | Reuse unchanged |
| `verdict-pill.tsx` / `VerdictPill` | Strong/Possible/Reach band | Existing verdict type | Reuse for visa read |
| `readiness-map.tsx`, `journey-rail.tsx`, `prompt-card.tsx` | Student guidance | Student-specific links and copy | Do not reuse in the queue or workspace shell |
| `program-card.tsx` and profile/plan components | Case content | Explicit case id and case-aware links | Refit data/link boundaries rather than duplicating visuals |

All repository reads stay server-only and use the authenticated Supabase client; interactive filters, shortcuts, and mutations are the only client boundaries.

## 5. States and permissions

### Role behavior

| Surface/action | Owner | Admin | Counsellor |
|---|---|---|---|
| Day view and All cases | All organization cases | All organization cases | Assigned cases only |
| Create case | Allowed | Allowed | Omitted and denied |
| Open case | Any organization case | Any organization case | Assigned case only |
| Change operational status | Allowed | Allowed | Allowed when assigned |
| Assign/reassign | Allowed | Allowed | Omitted and denied |
| Invite student | Allowed when shipped | Allowed when shipped | Allowed when assigned |
| Team roster | Read/write | Read/write, except owner-role restrictions | Read-only |
| Organization settings | Allowed | Omitted and denied | Omitted and denied |
| Documents | Case-authorized | Case-authorized | Assigned case only |
| Visa read visibility | Case-authorized read | Case-authorized read | Assigned case only |
| Generate/rerun visa judgement | Undecided | Undecided | Undecided |

The current team page must be corrected so cell 4’s counsellor read is not gated by cell 5’s `org.manage` mutation permission.

### Permission-denied states

- Unknown organization, non-member organization, inactive membership, cross-organization case, and unassigned-counsellor case access call `notFound()` to preserve the current non-enumeration rule.
- An owner/admin-only control is omitted for a counsellor rather than shown disabled.
- A mutation rejected after the page loads renders the existing actionable inline error and refreshes authoritative state when appropriate.
- `lookup-failed` is always an outage, never a permission denial.
- A counsellor reassigned away from an open case receives `notFound()` on the next authorization boundary; stale layout context must not grant continued access.

### Loading

- Add route-segment `loading.tsx` files for the organization queue and dynamic case segment.
- Queue loading shows the heading, summary-strip skeleton, toolbar skeleton, and eight flat row skeletons.
- Case loading shows a case-header skeleton, section rail, and two flat content panels.
- Team and settings loading preserve the workspace shell and skeleton only their content.
- Use the existing paper pulse treatment and reduced-motion guard; do not add spinners or row-by-row animation.

### Error

- Queue failure: “We couldn’t load this queue,” with Retry and no empty-case claim.
- Case lookup failure: preserve the workspace shell and show “We couldn’t load this student.”
- Team failure: preserve the team heading and use the current explicit outage language.
- Filter/count enrichment failure must not silently show zero; either omit the failed optional summary with an outage note or fail the queue if it changes ordering.
- Route errors use a workspace-specific `error.tsx` client boundary with Retry.
- A failed future judgement or document read affects its panel only when the rest of the case can still be stated truthfully.

### Empty

- Organization chooser distinguishes no memberships from lookup failure.
- Day view distinguishes zero cases, zero assignments, nothing needing action, and filtered-empty.
- Team roster returning zero after successful authorization is treated as a data inconsistency because the active viewer should have a membership row.
- Every case section distinguishes “not completed” from “couldn’t load.”
- Unlinked judgement never receives a neutral numerical score or a Reach verdict.

## 6. What survives

| Existing surface/code | Decision |
|---|---|
| `app/(app)/workspace/page.tsx` | Refit to auto-enter a sole organization and retain the multi-organization/zero-organization states |
| Current organization-aware route IDs | Keep |
| `students/page.tsx` access, search, status validation, scope narrowing, and cap warning | Keep and extract into shared queue/directory data and page components |
| Large `StudentRow` cards | Retire |
| `/workspace/[organizationId]` | Add as the Day view |
| `/students` | Keep as All cases rather than the daily landing |
| `/students/new` and `CaseCreateForm` | Keep; navigate successful creation to the new case overview |
| `/students/[caseId]/manage` | Keep URL and mutation logic; place inside the persistent case layout as Case details |
| `CaseManageControls` and existing mutation APIs | Keep; reduce component size without changing error semantics |
| `team/page.tsx` and `TeamMemberRow` | Refit to a dense roster and restore counsellor read-only access |
| `settings/page.tsx` and `OrgSettingsForm` | Keep owner-only behavior; wrap in workspace shell |
| `listOrgCases` | Keep its security rules, but introduce a queue repository that also batches assignments, `updated_at`, and plan items |
| `operational-status.ts` | Keep as the sole status vocabulary |
| `Card`, `Button`, `Input`, `Select`, `VerdictPill` | Reuse |
| Student `Dashboard`, `JourneyRail`, `PromptCard`, and `ReadinessMap` | Keep unchanged in the student shell; do not transplant them into the consultancy workspace |
| Student profile, matches, plan, and document domain components | Make case-aware and reuse beneath case routes |
| Shared `(app)` loading/error states | Split into student and workspace variants while preserving the honest failure semantics |
| Student footer and mobile tab bar inside workspace | Retire from workspace only |

## 7. Build plan

### PR 1 — Queue-first organization landing

Highest-leverage change: add `/workspace/[organizationId]`, replace card scanning with the dense queue, derive the current next action, add workload counts, and make queue state URL-addressable.

Tests:

- Pure attention-priority and next-action resolution tests.
- Repository tests for all-org versus assigned scope and batched plan/assignment reads.
- Page tests for owner/admin/counsellor columns and zero states.
- Component tests for semantic table markup, 40 rows, filters, and keyboard shortcuts.
- Browser pass at desktop and 375px widths with 40 seeded cases.

### PR 2 — Consultancy shell and access correction

Split student and consultancy chrome, add the organization rail, remove student journey UI from workspace routes, and restore the matrix-required read-only Team surface for counsellors.

Tests:

- Signed-in shell tests proving student chrome is absent from workspace.
- Role tests for Team read versus Team mutation.
- Active/inactive membership and organization-switching tests.
- Browser pass covering dashboard-to-workspace and workspace-to-dashboard navigation.

### PR 3 — Persistent case frame

Add the case layout, context header, section navigation, overview, and role-aware Case details; direct queue links and new-case success to the overview.

Tests:

- Owner/admin/all-case and counsellor/assigned-case route tests.
- Cross-org, unassigned, missing-case, and lookup-failed differentiation.
- Persistent header and active section-link tests.
- Browser pass for queue → case → section → back.

### PR 4 — Case-aware student domains

Mount profile, assessment, matches, and plan beneath the explicit case route by refitting existing domain components to accept case context.

Tests:

- Every repository receives the URL case ID rather than resolving the actor’s personal case.
- Positive owner/admin/assigned-counsellor tests and negative unassigned tests.
- Linked and unlinked abstention/empty-state tests.
- Student-route regression suite remains green.

### PR 5 — Stage 4 documents and submittability

Add the Documents route, document collaboration components, queue lodgement column, and the overview submittability panel only after the Stage 4 read exists.

Tests:

- Request/version/review states and single-blocker selection.
- Unauthorized upload/view/download/review denial.
- Panel-level loading and error behavior.
- Browser pass through request-to-approval and blocked-case queue filtering.

### PR 6 — Stage 5 student invitations

Turn the unlinked next action into a real invitation flow and replace the successful case linkage state without duplicating cases.

Tests:

- With-email, without-email, existing-user, new-user, expiry, replay, mismatch, and revoked invitation states.
- Counsellor invite allowed only on assigned cases.
- Queue and header linkage markers update after acceptance.
- Browser pass from unlinked queue row through accepted invitation.

### PR 7 — Visa judgement read

Add the judgement data contract approved by the product/access review, `visa-risk-panel`, `/visa-read`, and the queue’s Visa read column.

Tests:

- Strong/Possible/Reach words and colors.
- Each named risk factor and the single blocking item.
- No-score behavior for unlinked or insufficient-data cases.
- No generate/rerun control until its permission is explicitly added to the matrix.
- Browser pass comparing queue summary with case-detail judgement.

### PR 8 — State, accessibility, and density gate

Complete route loading/error boundaries, cap handling, responsive rows, keyboard navigation, contrast, and full live-browser regression.

Tests:

- Empty, filtered-empty, lookup failure, denial, and loading for every workspace route.
- Accessible names independent of color.
- No raw staff or student user IDs in markup beyond approved truncated staff references.
- No shadow, gradient, raw color, or new-token regressions.
- Browser verification for owner, admin, assigned counsellor, unassigned counsellor, linked case, and unlinked case.

