# MV-166 — Write the Stage 3 spec (consultancy workspace): access matrix, route model, grant resolution, and the slice carve

**Priority:** P1   **Owner:** agent
**Goal:** Produce `docs/superpowers/specs/2026-08-XX-stage3-workspace-and-access-matrix.md` — the single authoritative document Stage 3's slices read instead of the plan's prose — **and** the slice carve (IDs, one-line scopes, DAG, seams) that the Stage 3 umbrella will track. This card writes a document and carves cards. **It ships no product code and no SQL.**

## Why this card exists before any Stage 3 slice

Stage 1 was carved directly from the plan and **six slices each derived an access matrix from its prose independently**. The corrections are still on the record: `docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md` §9 lists **eleven** dossier/board/reality contradictions that had to be reconciled after the fact, and MV-154 carries a stage-level rule added 2026-08-03 — *"if this slice's implementation contradicts the spec, the spec is amended IN THIS PR"* — which exists because the prose version of the same instruction **failed twice running**.

Stage 2 did not repeat it: the spec was written first, grounded in a live capture of the hosted project, and every slice read it. That is the difference this card is buying.

**Stage 3's plan text is four bullets** (`docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md` lines 639–646). It is a larger product surface than Stage 2 and has **less** written down. Carving implementation slices off four bullets would be repeating the Stage 1 mistake deliberately.

## Context links

- **The plan section this expands:** `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md` §"Stage 3 — Consultancy workspace" (lines 639–646). Four bullets — org selection + team management; student list/search/filters/statuses/case creation/assignment; render the existing experience inside an explicit case route; case-context indicators — plus the exit gate: *"an authorized counsellor can create, find, assign, and manage a case without a student account."*
- **The model to copy, structurally:** `docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md`. Its §3 (one-sentence invariant every slice implements), §4 (per-table matrix with a slice-ownership row), §5 (what the stage does NOT change), §6 (verbs deferred forward), §9 (contradictions and required corrections), §10 (stage-level reverse-DAG rollback), §12 (dated amendment log) are the section shapes that made it work. **Copy the shape; derive the content from the live system, not from that file.**
- **Authoritative and NOT re-derivable here:** `docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md`. Every cell (owner/admin full-org, counsellor assigned-only, student linked-only, inactive membership = nothing, the dual-role rule) is settled there. Stage 3 **adds surfaces to that model, never cells.** Where this spec disagrees with that file, this spec is wrong.
- **The three debts Stage 2 handed forward — this spec must resolve all three, by name:**
  1. **The deferred write grants.** `authenticated` holds no INSERT on `profiles`, `plan_items`, `documents`, and SELECT-only on `assessments`. The exact grant list is in the Stage 2 spec **§6**, and the deferral is pinned by MV-160's `42501` negative assertion so it cannot rot silently. A counsellor creating a case cannot write anything until these resolve — **this is a prerequisite, not a late slice.**
  2. **Nine remaining `legacy-owner-scoped` service-role paths** in `lib/supabase/service-role-exceptions.ts`. Each already resolves a case and calls `requireCasePermission` through the authenticated client first; each names the grant it waits on. The spec states which of the nine retire in Stage 3 and which legitimately wait for Stage 4's document replacement.
  3. **Case routes and consultancy UI**, explicitly out of MV-157's scope.
- **The enforcement boundary, unchanged and binding:** `lib/cases/README.md` — RLS as the authenticated user is load-bearing; the server layer is defense in depth; the service-role client is an enumerated, audited exception list. Stage 3 adds the first *non-student* actors to reach student data through it.
- **The legal gate that governs what Stage 3 may run on:** `docs/legal/2026-07-29-stage0-decision-record.md` — D-A (Option B layered controller model; the platform layer is ours) and **D-B: the consultancy agreement gates real-data onboarding, i.e. Stage 3.** The agreement is with counsel and the privacy gate is **shut**. The plan's own exit gate provides the escape hatch: *"Real student personal data may enter only if the Stage 0 legal gate has been passed; otherwise Stage 3 runs on test data."*
- **What already exists to build on (Stage 1, live):** `supabase/migrations/20260730120000_stage1_tenancy_core.sql` (organizations, memberships, cases, assignments, invitations, audit_events), `supabase/migrations/20260730180000_case_aware_rls_policies.sql`, `lib/cases/` (`getCaseContext`, `requireCasePermission`, `getOrgContext`, `requireOrgPermission`, the permission matrix), `tests/integration/tenant-isolation.itest.ts`, `tests/integration/case-rls.itest.ts`.
- **Stage boundaries — what is NOT Stage 3:** documents/requests/versions/reviews and `storage.objects` policies are **Stage 4**; invitations and the student portal are **Stage 5**; audit/export/archive/delete are **Stage 6**. A spec that quietly absorbs a later stage's scope is a defect.
- **Siblings:** MV-149 (Stage 1 umbrella), MV-154 (Stage 2 umbrella) — read both for the umbrella/slice-map/DAG dossier shape this card's carve must produce.

## Acceptance criteria

### A — The spec exists and is grounded, not narrated
- [ ] **`docs/superpowers/specs/2026-08-XX-stage3-workspace-and-access-matrix.md` exists** and declares itself authoritative for Stage 3 in the same terms the Stage 2 spec does, including the rule that a slice contradicting it **amends it in that slice's own PR**.
- [ ] **Every claim about current schema, grants, policies or row shape is derived from a LIVE READ of the system** — `information_schema`, `pg_policy`, `pg_get_expr` — and the query used is recorded beside the claim. **Not** from the plan, not from a prior spec, not from a card dossier. This is the single practice that made the Stage 2 spec trustworthy: it was grounded in a capture, and where it disagreed with the database that was raised as a finding rather than resolved in SQL.
- [ ] **Reading production is NOT required and must not be attempted casually.** The local Docker stack plus the schema in `supabase/migrations/` is the correct source. If a live-hosted read is genuinely necessary, it is **founder-gated** and must respect MV-164's host guard — **which must not be weakened, bypassed, or "fixed."**
- [ ] **A §"what this spec does NOT change"** section, listing Stage 4/5/6 scope explicitly so a slice cannot drift into it.

### B — The access matrix extends Stage 1's, cell for cell
- [ ] **A per-surface matrix** covering every Stage 3 surface — org selection, team management, student list/search/filter, case creation, case assignment, the case route, case-context indicators — with a row per actor (org owner, org admin, counsellor assigned, counsellor unassigned, student linked, inactive membership, anonymous) and the verb allowed in each cell.
- [ ] **Every cell traces to the canonical Stage 1 matrix or is flagged as new.** A cell that contradicts `2026-08-02-stage1-canonical-access-matrix.md` is a **finding to raise on this card**, not a decision to take in the spec.
- [ ] **The dual-role rule and the inactive-membership rule are shown to hold on every new surface**, not assumed. These are the two cells Stage 1 got wrong most often.
- [ ] **A slice-ownership column**, so each cell names the slice that implements it — this is what stops six slices re-deriving the matrix.

### C — The three inherited debts are resolved on paper
- [ ] **The four deferred write grants get an exact resolution:** for each of `profiles`, `assessments`, `plan_items`, `documents`, the spec states the grant to add, the policy that will bound it, the slice that ships it, and **how MV-160's `42501` assertion is retired or amended in that same slice** (leaving a passing assertion that says "this grant does not exist" while granting it is a lie the suite will not catch — it will simply go red, which is the intended behaviour, and the spec must say who fixes it and how).
- [ ] **Each of the nine `legacy-owner-scoped` entries gets a named disposition:** retire in Stage 3 (with the slice), or wait for Stage 4 (with the reason). "Still legacy, no reason" is not acceptable — that is the same standard MV-154 set.
- [ ] **The consultancy-created-row shape is specified:** MV-157 established that rows with an owning Auth user dual-write `owner` **and** `case_id`, while consultancy-created rows carry `case_id` only. Stage 3 is where the second half first actually happens. The spec states, per table, what a consultancy-created row looks like and which invariants (uniqueness, the composite FK chain, the ownership-axis checks) must still hold for it.

### D — The carve is produced, with seams
- [ ] **A slice map in the MV-149/MV-154 shape:** a table of `ID | steps | scope in one line | depends on | explicitly NOT in scope`, with next-free IDs allocated from **MV-167 upward** (MV-166 is this card; verify the max id on `board.json` at carve time rather than trusting this sentence).
- [ ] **An explicit DAG**, with a stated reason for every edge — the Stage 2 umbrella's DAG section is the standard: each edge names the real data or code dependency that forces the order, and any release-train bracket (two cards, one PR) is justified by what breaks without it under auto-deploy.
- [ ] **A Stage 3 umbrella card is created** (tracking only, `col: backlog`) carrying the slice map, the DAG, the stage exit gate, and the legal-gate condition.
- [ ] **Each carved slice is added to `board.json` in `backlog`** with a real summary. **APPEND-ONLY — never dedup-union the card array** (a union has previously deleted a merged card outright; see MV-123).
- [ ] **The carve states which slices are reachable on TEST DATA and which need the legal gate**, so work can start without waiting on counsel and nobody is surprised at the exit gate.

### E — The stage exit gate is written down before the stage starts
- [ ] **The plan's exit gate is turned into observable criteria** — *"an authorized counsellor can create, find, assign, and manage a case without a student account"* becomes a named test at a named layer.
- [ ] **The gate names its own vacuity risk.** Stage 2's §A2 was nearly unfalsifiable because production held zero rows of the shape it tested; MV-165 recorded that honestly rather than claiming a pass. Stage 3's gate must say what data must exist for each criterion to be **non-vacuous**, and what a reader should conclude if it does not.

## Test plan

This card ships a document and card dossiers, so its "tests" are checks a reviewer can run:

- **Groundedness spot-check:** pick three schema/grant/policy claims at random from the spec and re-run the recorded query against the local stack. All three must reproduce. A claim whose query is missing is a defect.
- **Matrix consistency check:** every cell in the Stage 3 matrix that names an actor/verb pair also present in `2026-08-02-stage1-canonical-access-matrix.md` must **agree** with it. Disagreements are listed in a findings section, not silently reconciled.
- **Deferral closure check:** grep `docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md` §6 for every deferred verb, and assert each appears in the Stage 3 spec with a resolution. A verb deferred by Stage 2 and unmentioned by Stage 3 is how a deferral becomes permanent by accident.
- **Board integrity:** `node docs/kanban/build.mjs` exits 0 with the new cards present and the card count risen by exactly the number carved. (Use `node docs/kanban/build.mjs`, **not** `npm run board` — no worktree currently has usable `node_modules`; the builder runs on plain node and carries the fail-closed integrity guard.)
- **No code changed:** `git diff --stat origin/master -- app/ lib/ components/ supabase/ tests/` is **empty**. This card writes docs and board state only. A diff there means the card overran its scope.

## Integration gate

- `node docs/kanban/build.mjs` exits 0.
- `npm run typecheck` · `npm run lint` · `npm test` — expected to be untouched-green, since no source changes. If `node_modules` is unavailable locally, CI's `validate` and `integration` jobs are the gate; both are genuinely gating on this repo, so a green tick is real evidence.
- Branch `mv-166-stage3-spec` → PR against `master`. **`master` IS production (Vercel auto-deploys). The merge is FOUNDER-GATED — open the PR and stop. Never `--admin`.**

## Dependencies / blocked-by

- **Not blocked.** Stage 2 is complete and live in production (MV-165, PR #129, master `b3347a9`). Everything this card needs is merged.
- **Not blocked by the legal gate.** D-B gates real-data *onboarding*, not writing a spec. Producing the carve is precisely the work that is useful while counsel is out.
- **Should land before any Stage 3 implementation slice starts.** That is the entire point of the card.

## Risk notes

- **The main risk is this card quietly becoming Stage 3 itself.** A spec that starts sketching components, routes or SQL has stopped being a spec. The `git diff --stat` check in the test plan is the mechanical guard; enforce it.
- **The second risk is a spec that reads well and is ungrounded.** Stage 2's spec was trustworthy because it was captured, not narrated, and because it recorded contradictions with reality as *findings*. A confident, fluent, unverified matrix is worse than four bullets, because slices will trust it.
- **Scope creep toward Stage 4/5 is likely and specific.** "Case creation" pulls toward document requests (Stage 4); "team management" pulls toward invitations (Stage 5). Both are named non-goals. Say so in the spec's §"does NOT change".
- **The strategic tension is real and is the founder's call, not this card's.** Stage 3 shifts build effort from the student journey to the consultancy workspace, while student-side trust cards remain open (MV-131 guide honesty, the MV-137/MV-138 umbrellas). Stage 0's decisions settled the direction; this card **notes** the ordering question for the founder and does not relitigate it.

## Agent resume notes (for a cold start)

1. Read the plan's Stage 3 section (4 bullets), then the Stage 2 spec **for its shape**, then the Stage 1 canonical access matrix **for its content**.
2. Bring up the local Supabase stack under Docker (`npx supabase` is broken on this machine — win32-x64 binary resolution; apply/read via `docker exec … psql` against `supabase_db_merovisa`). Capture grants, policies and constraints for the six tenancy tables and the nine student-owned tables.
3. Write the spec §by§. Record the query beside every derived claim.
4. Produce the carve and the umbrella card; append to `board.json`; regenerate with `node docs/kanban/build.mjs`.
5. Open the PR and stop. Do not start a slice.

## Decision log

- **2026-08-07 — carved by the composer session.** Recommended over starting Stage 3 implementation directly, on the grounds that Stage 3 has four bullets of planning where Stage 2 had a 13-step sequence plus a dedicated spec, and that Stage 1's documented failure mode was exactly slices deriving a matrix from prose. Recommended over MV-163 (the Stage 1 tenancy-column guard) only for *ordering*: MV-163 is the largest fully-unblocked engineering card and remains the runner-up for the same slot.

## Done evidence

**Shipped 2026-08-07** on branch `mv-166-stage3-spec`. Documentation and board state only.

### What was produced

- **`docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md`** — 11 sections: authority + grounding (§1), captured inventory (§2), the stage invariant (§3), the 20-surface × 7-actor access matrix (§4), what Stage 3 does NOT change (§5), the three inherited debts resolved (§6), seven findings (§7), the slice carve + DAG (§8), the exit gate + vacuity analysis (§9), the query appendix (§10), decision log (§11).
- **`docs/kanban/cards/MV-167-stage3-umbrella.md`** — Stage 3 umbrella, `col: backlog`, tracking only.
- **Seven slice rows appended to `board.json`** in `backlog`: MV-168…MV-174, each with a real summary.

### A — grounded, not narrated

Grounded in a **live read** of `supabase_db_merovisa` (local Docker), verified at the repo migration head first: 24 files in `supabase/migrations/`, 24 rows in `supabase_migrations.schema_migrations`, identical set. **Production was not read** — criterion A prescribes the local stack, and MV-164's host guard was neither weakened nor touched. Eight queries recorded in spec §10 as `[Q1]`–`[Q8]` and cited inline beside every derived claim.

**The live read changed the answer twice**, which is the whole justification for the card:

1. **Table-level grants understate the write surface.** `information_schema.role_table_grants` shows `authenticated` holding no UPDATE on any table — reading only that, the deferred-grant debt looks enormous. MV-161 replaced table-wide privileges with **column-scoped** grants, visible only in `role_column_grants` `[Q3]`. Spec §2.2 records both and marks the column set authoritative.
2. **Canonical divergences #2 and #4 look open in the policies and are not.** `cases_update_accessor` admits the linked student and the column grant includes `archived_at`/`operational_status`. They are enforced by the `cases_write_surface_guard` **trigger** `[Q6]`, not by RLS. A false finding was drafted and withdrawn after reading the trigger body; spec §2.4 exists so the next reader does not repeat it.

### B — the matrix extends Stage 1's

Spec §4: 20 surfaces × 7 actors (owner, admin, counsellor-assigned, counsellor-unassigned, linked student, inactive membership, anonymous), each cell naming its enforcement point, its owning slice, and the canonical row it traces to. Cells that exist only in Stage 3 are marked **NEW** and raised as findings (F-2, F-3, F-4) rather than decided. The dual-role and inactive-membership rules are shown holding **mechanically** — `status = 'active'` appears in all five `actor_*_ids()` helpers, in `actor_assigned_case_ids()`'s join, and in `can_staff_case` `[Q5]` — not assumed.

### C — the three debts resolved on paper

- **Deferred grants: ten verbs, not four.** Stage 2 spec §6 enumerates ten; the card's "four" is a simplification of the four INSERTs. All ten re-measured live and dispositioned (spec §6.1): **3 granted** (`profiles` INSERT, `plan_items` INSERT, `assessments` UPDATE narrowed to `is_primary`) in MV-168; **4 refused permanently** (`assessments` INSERT — client-writable `result`/`rule_version` would let any actor mint their own verdict against the server-side scoring rule; `assessments` DELETE; `plan_items` DELETE); **1 deferred to Stage 4** (`documents` INSERT — its only caller also needs a Stage 4 Storage policy, so granting it alone retires no service-role path); **2 confirmed never** (append-only chains).
- **The `42501` pin is one test, not eight.** `grep -c 42501` returns 8 lines in `tests/integration/stage2-tighten.itest.ts`, but only **4 are assertions** pinning the deferral (lines 945/956/961/971), all inside the single `DEFERRED HALF` test; the other two assertions (775, 783) are cross-case policy tests that must not be touched. Spec §6.1 gives MV-168 a four-step retirement: invert 2 assertions, leave 2 green with a corrected comment, amend Stage 2 §6, add a dated §12 entry.
- **Nine service-role paths, dispositioned individually** (spec §6.2): 2 retire (MV-168+MV-172), 2 narrow, 2 reclassify to `sanctioned` (**F-6** — mislabelled), 3 wait for Stage 4. **The list also grows by one**: a case needs an assessment scored, and §6.1 refuses to let the client write one, so Stage 3 adds a case-scoped scoring route. Net 9 → 8.
- **Consultancy row shape** (spec §6.3): `owner IS NULL` + `case_id` set is already legal — every uniqueness index is keyed on `case_id`, never `owner` `[Q7]`, `owner` is nullable on all nine tables, and the composite FK chain is `(id, case_id)`. **Stage 3 needs grants and policies, not a migration.** One trap recorded: `mv155_derive_case_id_from_owner` only derives when `owner IS NOT NULL`, so a consultancy writer must supply `case_id` explicitly or hit `23502`.

### D — the carve

Max id verified on `board.json` at carve time (**167 cards, max MV-166**), so IDs run **MV-167 upward**. Umbrella MV-167 + seven slices MV-168…MV-174. DAG with **a stated reason per edge** (spec §8.2), each labelled **data** / **code** / **gate** — the one code edge (MV-170 → MV-171) is stated as parallelisable-at-the-cost-of-rework rather than dressed up as a data dependency. **No release train**, with the justification for its absence recorded. **All seven slices are reachable on seeded test data; none is blocked by D-B**, which gates real-data onboarding (Stage 7's pilot), not construction.

### E — the exit gate and its vacuity

Six observable criteria E1–E6 at named layers (spec §9.1), each paired with **how it could pass vacuously and the guard that prevents it** (§9.2). E4 is the direct analogue of Stage 2 §A2: it passes trivially if the case under test has a `student_user_id`, or on an empty write set — so it must assert `student_user_id IS NULL`, `owner IS NULL` on every row written, **and** a created-row count `> 0`. §9.3 states the gate's own limit up front: with D-B shut, every criterion is proved on seeded test data, so a green Stage 3 licenses the claim *the mechanism works*, never *it works for real students*.

### Findings — the highest-value output

Seven, in spec §7. **F-1 is a blocker and is deliberately left to the founder:** the plan's exit gate says an *authorized counsellor* can **create** and **assign**, but both enforcement layers deny a counsellor exactly those two verbs (`cases_insert_admin` and `case_assignments_insert_admin` require `is_org_admin`; `CASE_PERMISSION_MATRIX.counsellor` sets both to `"deny"`, with the comment *"Widening this is a deliberate later decision, not a convenience"*). The layers agree with each other — the plan's prose is what disagrees. The spec proceeds provisionally on reading (a) ("counsellor" = consultancy staff) and does not move a canonical cell.

### Gate

- `node docs/kanban/build.mjs` → **exit 0**, 175 cards (167 + 8 carved: the MV-167 umbrella + seven slices), MV-167 dossier resolved. `board.json` diff is **+89 / −1**, the single removed line being MV-166's own `"col": "ready"` — append-only, no union.
- **`git diff --stat origin/master -- app/ lib/ components/ supabase/ tests/` → EMPTY.** No product code, no SQL, no test changes. The card shipped a document and board state, as specified.
- `typecheck` / `lint` / `test` untouched-green by construction (no source files changed); CI's `validate` + `integration` are the gate on the PR.
