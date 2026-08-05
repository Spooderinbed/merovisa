# MV-161 — Unbounded client-writable columns on the five case INSERT surfaces (`supersedes_prediction_id` is a live P0)

**Priority:** P1 · **Owner:** agent
**Goal:** Close a measured, currently-live path by which any signed-in user permanently destroys another user's ability to delete their account — and then enumerate the rest of the same family rather than discovering it one column at a time.

**This is live on production today.** It is NOT a Stage 2 regression: it was measured admitting the identical insert under the *legacy* `pp_insert_own` policy, so it predates every Stage 2 slice and is unchanged by MV-159. Found by the MV-159 round-3 verifier while hunting a fourth direction of the "predicate bounds one axis, leaves another free" class.

## Context links

- **The finding, measured end to end** — MV-159 round-3 verification (2026-08-04), harnesses `mv159_supersedes.sql` (isolation + legacy-provenance test) and `mv159_http_r3.mjs` (PostgREST end-to-end).
- **The policies now live:** `supabase/migrations/20260803180000_case_aware_student_data_rls.sql` (MV-159, applied to production 2026-08-04). The five INSERT `WITH CHECK`s bound `case_id` (reachability) and `owner` (must be the case's student). They bound nothing else.
- **The trigger that turns a plant into a permanent lock:** `program_predictions_no_update` (`private.reject_prediction_update()`), `supabase/migrations/20260620000000_add_outcome_validation.sql`. SECURITY INVOKER and unconditional — it raises for `service_role` too.
- **The route it breaks:** `app/api/account/delete/route.ts` step 2, `DELETE … WHERE owner = userId`.
- **Authoritative access model:** `docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md` §4 (per-table policy form) and `docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md`.
- **Sequencing:** MV-160 (`docs/kanban/cards/MV-160-tighten-stage2-exit.md`) restores `reject_prediction_update()` to its unconditional form and keeps the pointer column, so the lock **survives MV-160 untouched**. This card lands BEFORE MV-160.

## The attack, as measured

1. Attacker A inserts a prediction in **A's own case**, on **A's own assessment**, owned by **A** — every axis MV-159 bounds is satisfied — with `supersedes_prediction_id = <victim B's prediction id>`. **ADMITTED**, in SQL and over PostgREST with a real JWT.
2. `supersedes_prediction_id` is `ON DELETE SET NULL`. Deleting B's prediction therefore fires an UPDATE on A's row, and `program_predictions_no_update` raises `P0001` unconditionally.
3. Consequences, all measured over the real REST surface:
   - `/api/account/delete` step 2 → **BLOCKED, `P0001`**. B can never delete their account.
   - Deleting the parent assessment → blocked. Deleting B's `auth.users` row → blocked.
   - **B cannot see the blocking row** — it lives in A's case, owned by A — so B can neither diagnose nor clear it.
4. One REST call, from any signed-in user, against any user whose prediction id they can learn.

`outcome_events.supersedes_event_id` is plantable on the same terms but harmless: no no-update trigger, so the `ON DELETE SET NULL` succeeds.

## Acceptance criteria

- [x] `program_predictions` INSERT is bounded on the parent-pointer axis. The idiom already present in the file: `and (supersedes_prediction_id is null or private.prediction_case_id(supersedes_prediction_id) = case_id)`. Zero regression risk — **nothing in `lib/` or `app/` ever writes `supersedes_*`**; only an attacker populates it.
- [x] The same bound is applied to `outcome_events.supersedes_event_id` (harmless today, identical shape, and it costs one conjunct to stop it becoming the next finding).
- [x] A probe proves the plant is refused **`42501` from the policy**, not incidentally by an FK — and that it still refuses under the MV-160 FK simulation (drop the composite FKs, re-run).
- [x] A probe proves the victim's `/api/account/delete` completes after an attacker's attempt is refused.
- [x] Mutation: reverting the conjunct turns the probe red with **admitted**, not merely uncaught.
- [x] **THE ENUMERATION PASS — the point of this card.** Every client-writable column on the five INSERT surfaces is enumerated against its policy, and each is either bounded or recorded as deliberately free with the reason. Known candidates from the verifier: `supersedes_*`, `id`, `created_at` / `recorded_at`, `verified_at`, `decision_authority`. Note `verified_at` is settable while `verified_by` is pinned NULL — cosmetic today (self-scoped, `source` forced to `self_reported`) but the same "unbounded because unenumerated" family.
- [x] The completeness guard in `tests/integration/student-data-rls.itest.ts` gains a **column-axis** dimension, so a client-writable column with no policy clause and no recorded exemption fails CI. It is already branch-aware after MV-159; this is the third axis.
- [x] Spec §4 amended in-PR with the per-table column bounds (stage rule: contradicting the spec means amending it here, not in a decision log).

## Test plan

- Extend `tests/integration/student-data-rls.itest.ts`: plant-refused on both pointer columns; account-delete-completes-after-refusal; the three MV-159 controls still admitted (own-case insert, consultancy `owner IS NULL`, counsellor naming the case's own student).
- Reuse the verifier's harnesses as the starting point rather than rewriting them.
- The enumeration pass ships as a test, not a document: a query that lists client-writable columns per table and asserts each appears in a bound or an exemption list.

## Integration gate

`npm run typecheck` · `npm run lint` · `npm test` · `npm run test:integration` against a LOCAL stack. The integration lane is gating; master is protected.

## Dependencies / blocked-by

- Depends on MV-159 (applied to production 2026-08-04) for the policy shapes and `private.case_student_id`.
- **Blocks MV-160.** MV-160 keeps the pointer column and restores the unconditional no-update trigger, so it neither closes nor surfaces this.

## Risk notes

- **Live exposure.** Unlike every other Stage 2 finding, this one is reachable on production now. Judged P1 rather than P0-drop-everything because it requires knowing a victim's prediction id, which no client surface currently exposes — but the account-delete consequence is permanent and invisible to the victim, and "no surface exposes it today" is exactly the kind of incidental protection this project has already been bitten by twice.
- The fix is one conjunct per table in an idiom already in the file, against columns nothing legitimate writes. The enumeration pass is the larger and more valuable half.
- Do NOT weaken `reject_prediction_update()` to work around the lock — the immutability guarantee is load-bearing for the outcome ledger. Bound the pointer instead.

## Agent resume notes (for a cold start)

1. Read the MV-159 migration's §1a/§1b and the five INSERT `WITH CHECK`s — you are adding one conjunct to the same shape, inside the case arm.
2. Reproduce the attack first, on a local stack, so you have a red before you have a green.
3. Then bound, then re-run, then mutate.
4. The enumeration pass is the deliverable that stops the next round of this: prefer a failing test over a written list.

## Decision log

- 2026-08-04 — Card carved by the integrator from the MV-159 round-3 verification, which found this while hunting a fourth direction of the axis-bounding class. Provenance established as pre-existing by re-creating the legacy `pp_insert_own` policy and measuring the identical plant admitted, so MV-159 neither introduces nor widens it.
- 2026-08-04 — Sequenced BEFORE MV-160 on the verifier's reasoning: MV-160 restores the unconditional no-update trigger and keeps the pointer column, so the lock survives that card untouched.
- 2026-08-05 — **The conjunct went to TOP LEVEL, not inside the case arm, and the card's build order said "inside the case arm".** The two are *provably equivalent today*: they differ only where the transitional arm is TRUE, which requires `case_id IS NULL`, and on both these tables the parentage clause is then `private.<parent>_case_id(x) = NULL` → NULL, which a WITH CHECK refuses either way. Top level was chosen because the equivalence is *an argument about a neighbouring clause* — exactly the "protected by an accident with a scheduled removal date" shape rounds 2 and 3 both found and this card exists to end. It also matches where MV-159 already puts every clause of this kind (`assessment_case_id(...) = case_id`, `source = 'self_reported'`, `verified_by is null`): the owner bound belongs inside the case arm because the two arms say *different things* about `owner`, whereas a pointer bound is one sentence that must hold on every arm. MV-160 §D is unaffected — the `-- MV-160 §D:` line keeps its position and its one-line-deletion property. Spec §4 rule 5 records the placement and the equivalence proof.
- 2026-08-05 — **`private.reject_prediction_update()` was NOT weakened, and neither was the column grant.** Both were live alternatives that would also unblock the victim, and both are refused in the migration's "Deliberate omissions": the immutability guarantee is load-bearing for the outcome ledger, and revoking `INSERT(supersedes_*)` would close the correction path the column exists for (spec §4.9). A predicate can tell the legitimate in-case shape from the cross-case one; a revoke cannot.

## Done evidence

**Built TDD on a local Supabase stack (`supabase_db_merovisa`, migrations through `20260803180000` + this card's `20260805120000`). Every figure below is captured output, not a claim.**

### The RED, before any fix — `supabase/rehearsal/MV-161-supersedes.sql`

```
MV161|P1|ADMITTED|planted=68936581-…|the victim's prediction is now pointed at by a row they cannot see
MV161|P2|ADMITTED|the victim's outcome event is now pointed at from another case
MV161|P3|ADMITTED|in-case supersede still works          <- control
MV161|P4|ADMITTED|in-case supersede still works          <- control
MV161|P5|DELETE-BLOCKED|sqlstate=P0001|program_predictions is immutable (no UPDATE permitted)
```

The attack reproduced exactly as carved: the plant satisfies **every axis MV-159 bounds** (own case, own assessment, owned by self) and the victim's `/api/account/delete` step 2 is then blocked forever with `P0001`.

### The fix — `supabase/migrations/20260805120000_bound_insert_pointer_columns.sql`

One conjunct on each of the two pointer-carrying INSERT predicates, plus `private.outcome_event_case_id(uuid)` — the fourth parent-case helper, needed because `supersedes_event_id` is **self**-referential (`prediction_case_id` already served the prediction pointer). Four apply-time assertions in the MV-159 §13 idiom: the pointer bound present on both, MV-159's owner bound re-checked on the two policies this file re-creates, `oe`'s `source = 'self_reported'` survived the re-type, and the helper hardened + not reachable by `anon`.

**Zero regression, grepped not asserted.** `grep -rn 'supersedes' lib/ app/ components/ scripts/` → four hits, **no writer**: `lib/supabase/types.ts` (generated types + FK names), a comment in `lib/outcomes/state-machine.ts`, an unrelated comment in `app/api/documents/upload/route.ts`. Neither pointer appears in `caseWriteColumns` / `caseBindColumns` / `caseUpsertColumns`.

### GREEN, and the refusal is the POLICY's

| Mode | P1 pp plant | P2 oe plant | P3/P4 in-case control | P5 victim delete |
|---|---|---|---|---|
| Baseline (composite FKs intact) | **REFUSED 42501** | **REFUSED 42501** | ADMITTED | **DELETE-OK** |
| **MV-160 FK simulation** (all four composite FKs dropped) | **REFUSED 42501** | **REFUSED 42501** | ADMITTED | **DELETE-OK** |

`42501` is `new row violates row-level security policy` — an FK violation would be `23503`, and `supersedes_*` carries only a simple self-FK anyway. The simulation drops **all four** composites (MV-160 §(f)'s two legacy owner ones *and* MV-156's two case ones, which MV-160 keeps), so it is strictly stronger than MV-160: a refusal that survives it survives MV-160 a fortiori.

### Mutation — RED with **admitted**, not merely uncaught

`supabase/rehearsal/MV-161-mutation.sql` re-creates one predicate byte-for-byte minus the one conjunct.

| Mutant | P1 | P2 | P5 | Named itest tests red |
|---|---|---|---|---|
| none (shipped) | REFUSED 42501 | REFUSED 42501 | DELETE-OK | **0** — 148/148 |
| `pp` conjunct reverted | **ADMITTED** | REFUSED 42501 | **BLOCKED P0001** | **3** — 145/148 |
| `oe` conjunct reverted | REFUSED 42501 | **ADMITTED** | DELETE-OK | **3** — 145/148 |
| both reverted | **ADMITTED** | **ADMITTED** | **BLOCKED P0001** | (harness only) |

No cross-talk: each conjunct is independently load-bearing. The three tests each mutant turns red are the **structural** one (`the pointer-axis bound is missing or reshaped`), the **enumeration** one (the column falls off the bound side into unaccounted — it catches the regression *independently*), and the **behavioural** one, whose failure reads `expected undefined to be '42501'` — i.e. the insert returned **no error at all**. That is the "admitted, not merely uncaught" the criterion asks for, and it is what `rls-negative-probes-are-inert` exists to demand.

### THE ENUMERATION PASS — shipped as a test, not a document

`tests/integration/student-data-rls.itest.ts` gains the **third axis** of the completeness guard (verb-aware → branch-aware → **column-aware**). Both sides derived at run time: columns from `information_schema.column_privileges`, clauses from `pg_policy`.

**44 client-writable INSERT columns across the five surfaces — 17 bounded, 27 recorded free with a reason:**

| Table | Bounded by a clause | Recorded free |
|---|---|---|
| `program_predictions` | `case_id`, `owner`, `assessment_id`, **`supersedes_prediction_id`** | 5 — `id`, `program_id`, `rule_version`, `score_snapshot`, `verdict` |
| `outcome_events` | `case_id`, `owner`, `attempt_id`, `source`, `verified_by`, **`supersedes_event_id`** | 10 — incl. `decision_authority`, `verified_at`, `recorded_at` |
| `application_attempts` | `case_id`, `owner`, `prediction_id` | 7 — incl. `id`, `created_at` |
| `user_program_state` | `case_id`, `owner` | 3 — `notes`, `program_id`, `status` |
| `document_status` | `case_id`, `owner` | 2 — `kind`, `obtained` |

The guard fails CI four ways, not one: an **unaccounted** column; a **stale** exemption (no longer writable, or now bounded — so the list cannot rot into a rubber stamp); a **placeholder** reason (this one fired during the build and was fixed — ten entries said only `"payload"`); and it asserts `case_id` / `owner` / both pointers / the three parentage clauses / `source` / `verified_by` are on the **bound** side positively, so a future failure cannot be "fixed" by moving an ownership axis into the exemption list.

**Two exemptions are flagged `REVISIT WITH STAGE 3 VERIFICATION`**: `outcome_events.decision_authority` and `verified_at` are free and carry no authority **only** because the same predicate pins `source = 'self_reported'` and `verified_by IS NULL` two conjuncts above them.

### The gate — all four, real output

| Command | Result |
|---|---|
| `npm run typecheck` | clean (`tsc --noEmit`, no output) |
| `npm run lint` | clean (`eslint`, no output) |
| `npm test` | **328 files, 2598 tests passed** |
| `npm run test:integration` (LOCAL stack) | **9 files, 802 tests passed, exit 0** |

`student-data-rls.itest.ts` went **142 → 148**: 5 new tests + 1 from the sixth `NEW_HELPERS` entry. The 142 baseline was measured **with the migration already applied**, so the fix regressed nothing before a single test was added.

**One harness note worth keeping.** A mid-run vitest worker crash on Windows ("Worker exited unexpectedly") aborts `afterAll`, and the orphaned fixture rows then fail `private.mv155_assert_case_backfill()` in a *later* suite — 41 failures across 4 files that had nothing to do with the change. Diagnosed by timestamp (`rule_version = 'mv159-test'`, created during the crashed run), cleared, and the lane re-run green. Also: `npm run test:integration | tail` reports the exit code of `tail`, so the first "green" read was a lie — redirect to a file and read `$?`.

### Not done here, deliberately

- **No production apply.** Founder-gated. This branch touches the local stack only.
- **No cleanup of existing planted rows.** The migration records the detection query instead; the shape is indistinguishable from a legitimate future correction, so it is a question for the founder, not a `DELETE` in a migration.
- **The four Stage 1 tenancy tables** (`cases`, `case_assignments`, `invitations`, `organization_memberships`) show the same class of question on their own INSERT surfaces — the enumeration query surfaced them incidentally. Out of this card's scope (it is scoped to the five case INSERT surfaces) and **not** covered by the new guard. Worth its own card.
