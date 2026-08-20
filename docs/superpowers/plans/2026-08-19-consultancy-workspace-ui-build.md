# Consultancy workspace UI — build plan

**Date:** 2026-08-19
**Spec (the contract):** `docs/superpowers/specs/2026-08-17-consultancy-workspace-ui.md`
**Roadmap:** `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`

This plan does not restate the spec. The spec fixes navigation (§1), the Day view (§2),
case detail (§3), the component inventory (§4), states and permissions (§5), what survives
(§6), and an eight-PR sequence (§7). This document records **where the lane actually stands
on 2026-08-19**, the one place the sequence should change, and how each remaining PR gets
built and verified.

---

## 1. Where the lane stands

| PR | Title | Card | Status |
|---|---|---|---|
| 1 | Queue-first organization landing | MV-179 | Merged (#145) |
| 2 | Consultancy shell and access correction | MV-180 | Merged (#146) |
| 3 | Persistent case frame | MV-181 | Merged (#147) |
| 4 | Case-aware student domains | MV-172 + MV-181 refit | **Already built** |
| 5 | Stage 4 documents and submittability | MV-182 = data half only | **In progress** |
| 6 | Stage 5 student invitations | — | Not carved |
| 7 | Visa judgement read | — | Not carved, contract unapproved |
| 8 | State, accessibility, and density gate | — | Not carved |

PR 4 needs no work. `app/(app)/workspace/[organizationId]/students/[caseId]/layout.tsx:65`
already mounts Overview, Profile, Matches, Plan, Checklist, Documents and Case details
beneath the explicit case route; MV-172 (Stage 3 slice 5) did that work and MV-181 refit it
into the persistent frame.

### What exists

- **21 of the 25 components** named in spec §4 exist under `components/workspace/`.
- **18 route files** under `app/(app)/workspace/`, covering every section in §1's route tree.
- MV-182 shipped `case_document_requests` (table, RLS, column-scoped grants), its repo, its
  API routes, the Documents page and `case-document-requests.tsx` (the chase list).

### What is missing

1. `submittability-panel.tsx` — the Lodgement read (§3, "Submittability read").
2. The queue's **Lodgement column** (§2, "Current and future columns").
3. Document **collaboration** — upload, versions, reviews. The chase list can ask for a
   document; nothing can receive one.
4. `visa-risk-panel.tsx` + the queue's **Visa read column** (§3, "Visa-risk read").
5. The invitation flow (§3, "Unlinked case" — the action is specified but inert until Stage 5).
6. **Every route-segment boundary.** There are zero `loading.tsx` and zero `error.tsx` files
   anywhere under `app/(app)/workspace/`. Spec §5 requires them for the organization queue
   and the dynamic case segment.

### Naming drift to reconcile

Spec §4 names `workspace-shell.tsx`, `workspace-nav.tsx` and `organization-switcher.tsx`.
The repo delivers that behaviour as `workspace-top-bar.tsx`, `org-rail.tsx` and the
workspace layouts. Confirm at carve time whether this is a rename to record in the spec or a
genuine gap; do not assume either.

---

## 2. The one sequence change

Spec §7 treats PR 5 as a single unit: "Add the Documents route, document collaboration
components, queue lodgement column, and the overview submittability panel **only after the
Stage 4 read exists**."

The Stage 4 read now exists, and it is enough for the two reads on its own.
`supabase/migrations/20260818120000_stage4_case_document_requests.sql` carries:

- `status text not null default 'outstanding' check (status in ('outstanding','resolved'))`
- `due_at`, `title`, `kind`
- `case_document_requests_case_id_status_idx on (case_id, status)` — an index whose only
  real purpose is this query, batched across a forty-row queue.

From that alone, both reads are derivable **today**:

- **Lodgement state** — zero outstanding requests versus one or more.
- **The single blocking item** — the outstanding request with the earliest `due_at`, nulls
  last, tie-broken on `created_at`.

So PR 5 splits, and the reads go first:

- **5A — the two reads.** Unblocked now. Small. Fills the region
  `case-decision-strip.tsx` has been holding open, and is the first time the Day view states
  the product's actual argument.
- **5B — the collaboration model.** Data: versions and reviews. Today `documents` and
  `document_status` each carry `UNIQUE (case_id, kind)` — strictly one document per kind per
  case, no resubmission and no history. This is what "Stage 4 replaces the model" means in the
  Stage 3 spec.
- **5C — the collaboration UI.** Upload, version history, review verbs on the Documents page.

### The honesty constraint on 5A

Zero outstanding requests means **nothing the consultancy has asked for is outstanding**. It
does not mean the case is submittable: no document has been verified, and the request list is
only as complete as the counsellor made it. The panel's copy must say the narrower thing.

Spec §3 already fences the shape — a word state, the single blocker, a link to Documents, and
"no completion percentage unless Stage 4 establishes a truthful denominator." It does not yet,
so there is no percentage in 5A.

This repo has shipped over-claiming surfaces twice (MV-143's abstain gate, MV-144's accuracy
meter) and both needed rework. The decision strip is the highest-trust real estate in the
product; the wording is the deliverable as much as the component is.

---

## 3. The PRs

### MV-183 — PR 5A: the lodgement read

**Ships:** `submittability-panel.tsx` mounted into `case-decision-strip.tsx`; the Lodgement
column in `case-queue-row.tsx` / `case-queue-table.tsx`; a pure derivation module over
`case_document_requests`; a batched queue read.

**Data:** existing. No migration.

**Tests:** pure blocker-selection (earliest `due_at`, nulls last, `created_at` tie-break);
zero-outstanding, one-outstanding, many-outstanding; word state and colour mapping (Strong =
ready, Possible = needs review, Reach = blocked, always with the word — §3); column omitted
entirely for a case whose requests fail to load, never rendered as ready (§5 "Error"); queue
batching does not N+1 across forty rows; counsellor scope respected.

**Browser pass:** desktop and 375px, with cases seeded at each state — none outstanding, one
overdue-by-`due_at`, several outstanding, and requests-unavailable.

**Blocked by:** MV-182's migration reaching production.

---

### MV-184 — PR 8a (pulled forward): workspace boundaries

**Ships:** `loading.tsx` for the organization queue and the dynamic case segment; a
workspace-specific `error.tsx` client boundary with Retry.

**Why now, out of §7 order:** there are none today. Every workspace route currently falls
through to whatever the parent provides, and §5 specifies exact skeletons and exact failure
copy. It is small, it is independent of every other slice, and it is the difference between a
slow queue looking slow and looking broken.

**Tests:** queue loading renders heading, summary skeleton, toolbar skeleton and eight flat
row skeletons; case loading renders header skeleton, section rail and two panels; reduced-motion
guard honoured; no spinners, no row-by-row animation; error boundary shows "We couldn't load
this queue" with Retry and makes no empty-case claim; `lookup-failed` presents as an outage,
never as a permission denial (§5).

**Browser pass:** throttled load at both widths; forced error.

---

### MV-185 — PR 5B: document collaboration model

**Ships:** the versions/reviews schema replacing the one-per-kind model; case-scoped
`storage.objects` policies; case-scoping the three existing routes
(`app/api/documents/upload`, `.../[id]/view`, `.../[id]`); signed downloads with a short TTL.

**Data:** new migration. Applied locally, rehearsed, then production as its own gated step.

**Tests:** unauthorized upload/view/download/review denial per §7; RLS mutation tests, not
denial-only probes; policy→verb bindings asserted with `polcmd::text`; the `%_case` census
left undisturbed (see MV-182's card); request→version→review state transitions.

**Note:** likely splits again once specced. Do not carve as one chip without a written spec
pass first.

---

### MV-186 — PR 5C: document collaboration UI

**Ships:** upload against a request, version history, review verbs (accept/reject) that
resolve the request. Extends the Lodgement read from "asked and outstanding" to "received and
reviewed" — at which point the panel may claim more than 5A allowed it to.

**Tests:** §7's request/version/review states and single-blocker selection; panel-level
loading and error behaviour; blocked-case queue filtering.

**Browser pass:** full request-to-approval walk.

---

### MV-187 — PR 6: Stage 5 student invitations

**Ships:** the invitation schema and flow; turns §2's next-action step 4 ("Invite the
student") and §3's unlinked-case block from inert copy into a live control; replaces the
linked state without duplicating cases.

**Tests:** §7's with-email, without-email, existing-user, new-user, expiry, replay, mismatch
and revoked states; counsellor invite allowed only on assigned cases; queue and header
linkage markers update after acceptance.

**Note:** this is the bridge between the two products, not a UI slice with a UI-shaped front.
Data and flow dominate. Expect to split.

---

### MV-188 — PR 7: visa judgement read

**Ships:** `visa-risk-panel.tsx` into the decision strip; the queue's Visa read column;
`/visa-read`.

**Blocked by:** the judgement data contract, unapproved per spec §0. Do not build the panel
speculatively — §3 fixes its contents precisely (label, `VerdictPill` band, one-sentence
conclusion, blocking item, five named risk rows, freshness copy) and forbids scores, radials,
gauges and factor bars, but the reads behind those five rows do not exist yet.

**Tests:** §7's Strong/Possible/Reach words and colours; each named risk factor and the single
blocking item; no-score behaviour for unlinked or insufficient-data cases (§5: "Unlinked
judgement never receives a neutral numerical score or a Reach verdict"); no generate/rerun
control until that permission is added to the access matrix (§5 row 10 is Undecided for all
three roles).

---

### MV-189 — PR 8: the state, accessibility and density gate

**Ships:** the remainder after MV-184 — cap handling, responsive rows, keyboard navigation,
contrast, and a full live-browser regression across every role and case state.

**Tests:** §7's empty / filtered-empty / lookup-failure / denial / loading for every workspace
route; accessible names independent of colour; no raw staff or student user IDs in markup
beyond approved truncated staff references; no shadow, gradient, raw colour or new-token
regressions.

**Browser pass:** owner, admin, assigned counsellor, unassigned counsellor, linked case,
unlinked case — the full matrix.

---

## 4. How each slice gets built

The mechanism that produced MV-179 through MV-182, unchanged:

1. Card dossier written first (`docs/kanban/cards/MV-NNN-*.md`) — acceptance criteria, test
   plan, resume notes for a cold agent.
2. Board state set in `board.json`, `npm run board` regenerated (it fails closed on a lying
   board).
3. A self-contained chip spawns a build session. It cites spec sections rather than
   re-deciding them.
4. TDD. Gate green: `npm run typecheck`, `npm run lint`, `npm test`, plus integration where
   schema moved.
5. Evidence recorded on the dossier, card to In Review, PR opened.
6. Founder-gated merge. Never `--admin`.

### Three rules specific to UI slices

**The spec is the contract.** §4 fixes each component's file name, purpose and reuse column;
§5 fixes role behaviour per surface. A fresh session left to its own judgement will reach for
`VerdictPill` where §4 says `CaseStatusPill`, or add a "Coming soon" panel where §2 says omit
the column entirely. Cite the section in the chip.

**A live browser pass is mandatory.** jsdom has no layout engine. A fully green suite cannot
see a broken grid, an overflow, a contrast failure or a 375px collapse — measured here twice,
as two hotfix PRs after a green run (MV-113, MV-114). Every UI slice ends with
`preview_start`, seeded fixtures, desktop **and** 375px, screenshots on the PR.

**Seed the states, not just the happy path.** A panel with no seeded data renders its empty
state and proves nothing. Each slice above names the states its browser pass must cover.

### Design constraints carried in every chip

Tokens only — no shadows, gradients or raw colours. Sentence case. Imageless product body.
`VerdictPill` reused for the visa band only. Flat primary-tint for the next-action surface,
never a shadowed feature card (§3). Motion `cubic-bezier(.22,.61,.36,1)`, reduced-motion
guarded.

---

## 5. Preconditions

**MV-182's migration is not in production.** It is applied to the local Docker stack only.
MV-183 reads that table in production, and MV-185 stacks storage policies on it. Applying it
needs the Supabase MCP re-authed (`/mcp` in an interactive session) or the SQL run from the
Supabase dashboard. This gates MV-183 and should precede any further migration.

**MV-182 is still `inreview` on the board** and gets trued to `done` on the next branch's
first board commit, per the standing pattern.

---

## 6. Carve

Next free ID is **MV-183** (max on the board is MV-182, 182 cards, no duplicate IDs).

| Card | PR | Size | Blocked by |
|---|---|---|---|
| MV-183 | 5A lodgement read | S | MV-182 migration in prod |
| MV-184 | 8a boundaries | S | nothing |
| MV-185 | 5B collaboration model | L, spec first | MV-183 |
| MV-186 | 5C collaboration UI | M | MV-185 |
| MV-187 | 6 invitations | L, splits | MV-185 |
| MV-188 | 7 visa read | M | judgement contract (founder) |
| MV-189 | 8 full gate | M | all of the above |

WIP stays 1. MV-183 and MV-184 are the only two that can start immediately, and MV-184 needs
nothing at all.
