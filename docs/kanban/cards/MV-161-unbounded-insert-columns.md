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

- [ ] `program_predictions` INSERT is bounded on the parent-pointer axis. The idiom already present in the file: `and (supersedes_prediction_id is null or private.prediction_case_id(supersedes_prediction_id) = case_id)`. Zero regression risk — **nothing in `lib/` or `app/` ever writes `supersedes_*`**; only an attacker populates it.
- [ ] The same bound is applied to `outcome_events.supersedes_event_id` (harmless today, identical shape, and it costs one conjunct to stop it becoming the next finding).
- [ ] A probe proves the plant is refused **`42501` from the policy**, not incidentally by an FK — and that it still refuses under the MV-160 FK simulation (drop the composite FKs, re-run).
- [ ] A probe proves the victim's `/api/account/delete` completes after an attacker's attempt is refused.
- [ ] Mutation: reverting the conjunct turns the probe red with **admitted**, not merely uncaught.
- [ ] **THE ENUMERATION PASS — the point of this card.** Every client-writable column on the five INSERT surfaces is enumerated against its policy, and each is either bounded or recorded as deliberately free with the reason. Known candidates from the verifier: `supersedes_*`, `id`, `created_at` / `recorded_at`, `verified_at`, `decision_authority`. Note `verified_at` is settable while `verified_by` is pinned NULL — cosmetic today (self-scoped, `source` forced to `self_reported`) but the same "unbounded because unenumerated" family.
- [ ] The completeness guard in `tests/integration/student-data-rls.itest.ts` gains a **column-axis** dimension, so a client-writable column with no policy clause and no recorded exemption fails CI. It is already branch-aware after MV-159; this is the third axis.
- [ ] Spec §4 amended in-PR with the per-table column bounds (stage rule: contradicting the spec means amending it here, not in a decision log).

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

## Done evidence

(pending)
