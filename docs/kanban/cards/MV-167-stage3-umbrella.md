# MV-167 — Umbrella: Stage 3 consultancy workspace (MV-168 grants · MV-169 org+team · MV-170 student list · MV-171 case creation+assignment · MV-172 case route · MV-173 indicators+field allowlist · MV-174 service-role retreat + stage exit)

**Priority:** P1 · **Owner:** founder + agent
**Goal:** Drive Stage 3 (consultancy workspace) to its exit gate — *an authorized counsellor can create, find, assign, and manage a case without a student account* — by coordinating seven implementation slices, without itself shipping any code, SQL, or UI.

**Umbrella — do NOT build from this card.** It tracks a stage; the work lives in MV-168…MV-174. Its job is to hold the exit gate, the slice DAG, the stage-level findings, and the one decision the spec explicitly declined to take (F-1).

**Source:** Stage 3 of the consultancy plan (`docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md` lines 639–646 — four bullets), carved by MV-166 into `docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md`.

## The authoritative document

**`docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md` is authoritative for Stage 3.** Every slice reads it instead of the plan's prose — that is the entire reason MV-166 existed. It is grounded in a live read of the database (query appendix §10), not narrated.

Three binding rules from its §1, carried here so a slice cannot miss them:

1. Where a slice dossier disagrees with the spec, **the dossier is wrong**. Where the spec disagrees with the live database, **that is a finding to raise, not something to fix in SQL**.
2. **A slice that contradicts the spec amends it IN THAT SLICE'S OWN PR** — a decision log or PR body does not discharge this. Carried from MV-154 because the prose version of this rule failed twice in Stage 2.
3. The spec **adds surfaces to the Stage 1 canonical access matrix; it never moves a cell.** `docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md` stays settled.

## Context links

- **Stage 3 definition + exit gate:** plan lines 639–646. Exit gate **verbatim** (line 646): *"an authorized counsellor can create, find, assign, and manage a case without a student account. Real student personal data may enter only if the Stage 0 legal gate has been passed; otherwise Stage 3 runs on test data."*
- **The access matrix:** spec §4 — 20 surfaces × 7 actors, with a slice-ownership column and a trace-to-canonical column.
- **The three inherited debts, resolved:** spec §6.1 (ten deferred verbs, not four), §6.2 (nine service-role paths), §6.3 (the consultancy-created row shape).
- **The findings:** spec §7 — F-1 (exit gate vs. canonical), F-2 (nobody can create an org), F-3 (student can rewrite `display_name`/`email`), F-4 (internal notes has a permission but no column), F-5 (team management without invitations), F-6 (two mislabelled registry entries), F-7 (confirmed-correct, do not re-litigate).
- **Enforcement boundary, unchanged and binding:** `lib/cases/README.md` — RLS as the authenticated user is load-bearing; the server layer is defense in depth; service-role is an enumerated, audited exception list.
- **The legal gate:** `docs/legal/2026-07-29-stage0-decision-record.md` D-B. See "Dependencies" below — it does **not** block this stage's build.
- **Predecessor umbrellas (dossier shape):** `cards/MV-149-stage1-umbrella.md`, `cards/MV-154-stage2-umbrella.md`.

## Slice map

| Slice | Bullet | Scope in one line | Depends on | Explicitly NOT in scope |
|---|---|---|---|---|
| **MV-168** CONSULTANCY WRITE GRANTS | prereq | The only SQL in Stage 3: `INSERT` grant+policy on `profiles` and `plan_items`, `UPDATE (is_primary)` grant+policy on `assessments`, each mirroring the five-sibling `WITH CHECK` template. Retires 2 of the 4 DEFERRED HALF `42501` assertions and rewrites the other 2's comment. Amends Stage 2 spec §6. | — | No UI, no route. No `assessments`/`documents` INSERT (refused / deferred to Stage 4). No schema change. |
| **MV-169** ORG CONTEXT + TEAM MANAGEMENT | 1 | Org selection for a multi-org actor + team list, role change, deactivate. Owner-only org settings. | — | **No org creation (F-2). No invitations (F-5 — Stage 5).** No case surfaces. |
| **MV-170** STUDENT LIST / SEARCH / FILTERS | 2a | The org-scoped case list: search, filter, status display. Assigned-only for counsellors, all-org for owner/admin. Read-only. | MV-169 | No creation, no assignment. No writes at all. |
| **MV-171** CASE CREATION + ASSIGNMENT | 2b | Create a case with `student_user_id IS NULL`; assign/reassign the single primary-counsellor slot; write `operational_status`. Carries **F-1's resolution**. Adds the case-scoped scoring route. | MV-168, MV-170 | No archive (Stage 6). No student invitation (Stage 5). Not a multi-counsellor model. |
| **MV-172** THE CASE ROUTE | 3 | Render the existing MeroVisa experience under an explicit case route for a case that is not the actor's own. Flips `app/api/profile/section` and `app/api/plan/action` onto the authenticated client. | MV-168, MV-171 | No documents model change (Stage 4). No indicators (MV-173). |
| **MV-173** CASE-CONTEXT INDICATORS + FIELD ALLOWLIST | 4 | Whose case am I in, and is it mine — persistent and unmissable. **Plus F-3**: close the `display_name`/`email` write gap the list surface exposes. | MV-172 | No new data. No notes (F-4). |
| **MV-174** SERVICE-ROLE RETREAT + STAGE EXIT | exit | Reclassify registry entries 1–2, narrow 3–4, confirm 5–7 wait for Stage 4, register the new scoring route. Prove the exit gate. **Carries the stage exit.** | all | No new surfaces. |

## DAG

```
MV-168 ──┬──────────────► MV-171 ──► MV-172 ──► MV-173 ──┬──► MV-174
         └──────────────► MV-172                          │
MV-169 ──► MV-170 ───────► MV-171                         │
MV-168 ───────────────────────────────────────────────────┘
```

Every edge and its forcing reason is in **spec §8.2**. Summarised: MV-168 → MV-171/MV-172 are **data** edges (the writes are `42501` until the grant exists); MV-169 → MV-170 is a **data** edge (no org context, no scope to list within); MV-170 → MV-171 is a **code** edge (shared org-scoped query + row component — parallelisable at the cost of rework, and stated as such rather than dressed up as a data dependency); MV-171 → MV-172 is a **data** edge (the route must be exercised against a case with no student account, and MV-171 is what produces one); MV-172 → MV-173 and MV-173 → MV-174 are ordering/gate edges.

**No release-train bracket, and that is a decision.** Stage 2 needed `[MV-157 + MV-158]` in one PR because a half-merge created a live window where the claim path wrote `owner` without `case_id`, under auto-deploy. No Stage 3 pair has that property: every Stage 3 surface is new and unreachable until its own route ships, so a half-merged Stage 3 is a feature that does not exist yet, not a broken invariant. **The one edge that needed checking is MV-168**, which widens a production grant before any caller exists — safe only because its policy carries the `owner IS NULL OR owner = case_student_id(case_id)` conjunct; see spec §8.2.

## Acceptance criteria

The umbrella is a tracking card. Its criteria are observable stage-completion facts.

- [ ] **Seven slice dossiers exist**, each meeting the README Definition of Ready. (Board rows with real summaries are carved by MV-166; the dossiers are written as each slice is pulled to Ready.)
- [ ] **The DAG is respected in board order and in work.** Each slice reaches Done before its successor starts. Stage 3 has **no** train exception — `inprogress` WIP stays 1 and means one card.
- [ ] **F-1 is decided by the founder before MV-171 starts.** The plan's exit gate says a *counsellor* can create and assign; **both** enforcement layers deny exactly those two verbs to a counsellor (`cases_insert_admin` / `case_assignments_insert_admin`; `CASE_PERMISSION_MATRIX.counsellor["case.create"|"case.assign"] = "deny"`). The spec proceeds provisionally on reading **(a)** — "counsellor" is loose prose for "consultancy staff", so the surface is built for owner/admin and nothing moves. Reading **(b)** widens the counsellor role, which **moves a canonical cell** and needs its own slice plus edits to the Stage 1 suites. **This is not an agent decision.**
- [ ] **The stage exit gate is observably green (MV-174).** Six criteria E1–E6, spec §9.1, each with its vacuity guard from §9.2 actually implemented — notably **E4 must assert `cases.student_user_id IS NULL`, `owner IS NULL` on every row written, *and* a created-row count `> 0`**, or it passes trivially on an empty write set. This is the direct analogue of the Stage 2 §A2 vacuity MV-165 recorded.
- [ ] **The exit is not overclaimed.** Spec §9.3: with D-B shut, every criterion is proved on **seeded test data**. Done evidence may claim *the mechanism is built and proven under RLS as the authenticated user*; it may **not** claim it works for real students or real volumes. That is Stage 7's pilot.
- [ ] **The service-role list is accounted for entry by entry, and its growth is admitted.** 9 → 7 by disposition (2 retire, 2 narrow, 2 reclassify, 3 wait for Stage 4) **plus 1 new entry** for the case-scoped scoring route → **8 at stage exit**. MV-154's framing of the list as monotonically shrinking does not survive Stage 3, and the exit records the new entry as a deliberate registration rather than a leak.
- [ ] **No slice merged on a red gate.** Master is protected: required checks `integration` **and** `validate`, strict/up-to-date, no bypass. Every slice merges as its own PR. **`master` IS production (Vercel auto-deploys); every merge is FOUNDER-GATED.**
- [ ] **No new real student personal data entered the system.** Stage 3 builds and proves on test data; D-B's prohibition remains in force and is discharged by Stage 7, not here.
- [ ] **Every slice that contradicted the Stage 3 spec amended it in its own PR** (spec §1 rule 2). A slice that discharges this cheaply (nothing contradicted) says so on its card; silence is not a discharge.

## Test plan

The umbrella owns no tests; the stage's proof is the union of the slices', gated by MV-174.

- **MV-168** — real-DB: a counsellor INSERT into `profiles`/`plan_items` for an assigned case **succeeds with `owner IS NULL`**; the same INSERT naming another user's id as `owner` is refused; the `assessments` and `documents` INSERT refusals stay `42501`; the DEFERRED HALF test's remaining assertions still pass with a corrected comment.
- **MV-169** — org selection for a multi-org actor; an `inactive` membership yields no org; an admin cannot rename the org (owner-only); role change refuses `role='owner'` for a non-owner.
- **MV-170** — an assigned counsellor sees their case, an **active but unassigned** counsellor in the **same org** does not (the fixture must hold ≥2 cases or the test is a tenancy test, not an assignment test).
- **MV-171** — case created with `student_user_id IS NULL` through the **authenticated** client; a second `primary_counsellor` assignment is `23505`; a counsellor's create/assign attempt is refused under reading (a).
- **MV-172** — route renders for the assigned counsellor, 404s for the unassigned; the two flipped routes no longer construct a service-role client (the ESLint fence + registry sweep are the mechanical check).
- **MV-173** — the indicator names the case and distinguishes "not mine"; F-3: a linked student's `display_name`/`email` write is refused.
- **MV-174** — E1–E6 with the §9.2 guards; the registry disposition test asserts **per entry**, never a count.

## Integration gate

- `npm run typecheck` · `npm run lint` · `npm test`
- **`npm run test:integration`** is mandatory on every slice that touches a grant, policy or case-scoped read/write — which is all of MV-168, MV-170, MV-171, MV-172, MV-174. Unit tests cannot exercise RLS as the authenticated user.
- In CI, `integration` and `validate` are both required, strict/up-to-date, no bypass.

## Dependencies / blocked-by

- **Internal DAG:** see above.
- **Upstream, all shipped and live in production:** Stage 1 (MV-149 group) and Stage 2 (MV-154 group — MV-165, PR #129, master `b3347a9`). The schema work that makes a student-less case possible is **already done**: `owner` is nullable on all nine student-owned tables and every uniqueness index is keyed on `case_id`, not `owner` (spec §2.5, §2.6). Stage 3 needs **grants and policies, not a migration**.
- **NOT blocked by the Stage 0 D-B legal gate.** D-B gates *onboarding real student personal data entered by consultancy staff*. It does not gate building or proving the mechanism, and the plan's own exit gate provides the escape hatch: *"otherwise Stage 3 runs on test data."* **All seven slices are reachable on seeded test data** (spec §8.3). Do not stall them on counsel.
- **The named pilot consultancy** remains an open Stage 0 exit-gate item. It constrains **Stage 7's pilot**, not this stage's build.
- **F-1 gates MV-171 only**, not the stage. MV-168, MV-169, MV-170 can all start before the founder rules on it.

## Risk notes

- **The strategic tension is real and is the founder's call.** Stage 3 shifts build effort from the student journey to the consultancy workspace while student-side trust cards remain open (MV-131 guide honesty, the MV-137/MV-138 umbrellas). Stage 0's decisions settled the direction; this card **notes** the ordering question and does not relitigate it.
- **Scope creep toward Stage 4/5 is likely and specific.** "Case creation" pulls toward document requests (Stage 4); "team management" pulls toward invitations (Stage 5). Both are named non-goals in spec §5, and F-5 records that bullet 1 reads as a completer surface than it is.
- **The field-allowlist gap (F-3) is a trust risk, not a cosmetic one.** A student can today rewrite the `display_name` and `email` that MV-170's list shows a counsellor. It is only reachable once that list exists — which is why it is fixed in MV-173, in the same stage that creates the exposure, not deferred.
- **A green suite will not prove the stage.** Spec §9.2 lists, per criterion, how it can pass while asserting nothing. E4 is the one that repeats Stage 2's §A2 failure if written carelessly.

## Agent resume notes (for a cold start)

1. Read `docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md` **in full** — it replaces the plan's four bullets and is authoritative.
2. Check whether F-1 has been decided. If not, MV-168/169/170 are still safe to build; MV-171 is not.
3. Pick the top Ready slice per the DAG; write its dossier if it does not exist yet.
4. Local Supabase runs under Docker (`npx supabase` is broken on this machine — win32-x64 binary resolution); read/apply via `docker exec … psql` against `supabase_db_merovisa`. Regenerate the board with `node docs/kanban/build.mjs`, not `npm run board`.
5. Open a PR and stop. **The merge is founder-gated.**

## Decision log

- **2026-08-07 — carved by MV-166.** Seven slices from four plan bullets, grounded in a live schema read rather than the prose. Key carve decisions: the grants are a **prerequisite slice** (MV-168), not a late one, because nothing can be written into a student-less case without them; bullets 3 and 4 stay separate because F-3's fix belongs with the indicator slice; and the exit gets its own slice because the service-role retreat and the exit proof are the same work.
- **2026-08-07 — F-1 raised and deliberately left open.** The spec declines to move a canonical cell and proceeds provisionally on reading (a).

## Done evidence

(pending — this umbrella closes when MV-174's exit gate is green and the founder accepts the stage.)
