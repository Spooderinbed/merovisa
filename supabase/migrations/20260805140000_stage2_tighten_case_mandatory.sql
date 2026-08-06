-- =====================================================================
-- MV-160 — Stage 2 tighten + exit gate
-- =====================================================================
-- Plan steps 12 ("make `case_id` mandatory where the domain requires it") and 13 ("remove legacy
-- owner assumptions after regression and migration verification"). This is the migration that ENDS
-- the nullable-`case_id` window MV-155 opened and MV-156 covered with a compensating CHECK.
--
-- ---------------------------------------------------------------------
-- THE ORDER OF THE NINE STEPS BELOW IS LOAD-BEARING FIVE TIMES, AND ONLY TWO OF THE FIVE FAIL
-- LOUDLY. Do not reorder anything here as a tidy-up. Numbered so a later reader has to notice.
-- ---------------------------------------------------------------------
--   (a) RECONCILIATION SWEEP FIRST. `private.mv155_backfill_personal_cases()` is re-run over the
--       residue of the MV-157 -> MV-158 window and of any lost dual-write, then
--       `private.mv155_assert_case_backfill()` proves there is none left. Without this, step (b)
--       aborts on production against exactly those rows, having already taken ACCESS EXCLUSIVE on
--       eight tables. FAILS LOUDLY (mid-migration), but only after the locks.
--   (b) `SET NOT NULL` on the eight `case_id` columns. NOT `assessments` — see (c).
--   (c) The `assessments` CHECK. Its `case_id` STAYS NULLABLE: anonymous rows are case-less by
--       design until claimed or purged (MV-135, 3-day TTL). A migration that SUCCEEDS in setting
--       `assessments.case_id NOT NULL` has destroyed the anonymous rows — that is a failure wearing
--       a success's clothes, which is why the column-level NOT NULL is absent and a CHECK expresses
--       the real rule instead.
--   (d) THE POLICY REWRITE. Removes MV-159's transitional owner disjunct. It goes AFTER (b) because
--       `case_id NOT NULL` is what makes the disjunct redundant. Drop it while any row can still be
--       case-less and that row becomes invisible to its own owner — NO ERROR, NO LOG LINE, just a
--       student whose plan or shortlist is gone. SILENT. This is the dangerous one.
--   (e) Drop ALL EIGHT `<table>_ownership_axis_present` checks. Safe only because (b) already made
--       the disjunct's right branch unconditionally true on exactly those eight. Drop them while any
--       `case_id` is still nullable and the MATCH SIMPLE hole on the three-table chain silently
--       reopens. SILENT.
--   (f) Drop the two legacy composite FKs, THEN
--   (g) their `unique (id, owner)` targets. Reverse (f)/(g) and Postgres refuses the DROP outright
--       (2BP01) and the whole migration aborts. FAILS LOUDLY.
--   (h) Drop the orphaned covering index and the seven superseded owner-keyed uniqueness rules.
--   (i) LAST: restore `private.reject_prediction_update()` to its unconditional body. It must be
--       last because step (a)'s sweep UPDATEs `program_predictions.case_id`, and ONLY MV-155's
--       narrowed body permits that update. Restore earlier and the migration aborts on its own
--       reconciliation step. FAILS LOUDLY BUT CONFUSINGLY — the error names the immutability
--       trigger, not the ordering.
--
-- ---------------------------------------------------------------------
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------
--   * NO `DROP COLUMN`. The `owner` columns SURVIVE as the provenance link to the student's Auth
--     user. `app/api/account/delete/route.ts`'s teardown and MV-135's `owner is null` purge
--     predicate both still read them, Stage 4's document replacement and Stage 6's export/deletion
--     work still read the legacy shape, and the equivalence proof depends on them. Column removal is
--     a Stage 6 item. Keeping them is also what makes this migration's rollback a pure DDL
--     re-application: no data moves in either direction.
--   * NO `DELETE`. Not one row.
--   * The surviving PLAIN `owner` lookup indexes are NOT dropped — `assessments_anon_purge_idx`
--     (MV-135's purge, pinned to the `owner is null` predicate by MV-158) and `assessments_owner_idx`
--     are load-bearing after this migration, and the per-table `<table>_owner_idx` set still serves
--     the account-delete sweep. Only UNIQUE/PK/FK-target keys on `owner` go.
--   * `documents` / `document_status` keep their legacy shape otherwise. The header/versions
--     replacement is Stage 4 and is an explicit non-goal here.

-- =====================================================================
-- (a)  RECONCILIATION SWEEP — the migration's opening statement
-- =====================================================================
-- MV-158 delegates the bulk remedy for owned-but-`case_id`-null rows here (its criterion F2 and its
-- Decision log both name "MV-160's reconciliation sweep"). MV-155 §C built the backfill to be
-- idempotent precisely so it could be re-run as this sweep.
--
-- The repair count is NOT swallowed: it is raised as a notice and belongs in the equivalence report.
-- A non-zero count means the MV-157 dual-write leaked, which is a finding about Stage 2, not a
-- housekeeping detail. "There will be no such rows" is exactly the assumption a `SET NOT NULL` on
-- production is the wrong place to test.
do $$
declare
  sweep_report jsonb;
begin
  sweep_report := private.mv155_backfill_personal_cases();
  raise notice 'MV-160 (a) reconciliation sweep report: %', sweep_report;

  -- The assert is what turns the sweep from a hopeful UPDATE into a gate. If any owned row is still
  -- case-less after the sweep, this raises and the migration stops HERE — before any NOT NULL has
  -- taken a lock, and before any guard has been dropped.
  perform private.mv155_assert_case_backfill();
  raise notice 'MV-160 (a) private.mv155_assert_case_backfill() passed — every owned row carries a case.';
end;
$$;

-- =====================================================================
-- (b)  `case_id` NOT NULL on the eight tables whose domain requires it
-- =====================================================================
-- Eight, not nine. `assessments` is handled by (c).
alter table public.profiles             alter column case_id set not null;
alter table public.plan_items           alter column case_id set not null;
alter table public.user_program_state   alter column case_id set not null;
alter table public.documents            alter column case_id set not null;
alter table public.document_status      alter column case_id set not null;
alter table public.program_predictions  alter column case_id set not null;
alter table public.application_attempts alter column case_id set not null;
alter table public.outcome_events       alter column case_id set not null;

-- =====================================================================
-- (c)  `assessments` — the one deliberate exception, expressed as a CHECK
-- =====================================================================
-- The real rule is not "every assessment has a case"; it is "an OWNED or CLAIMED assessment has a
-- case". An anonymous, unclaimed row is case-less by design and stays that way until it is claimed
-- (MV-158) or purged (MV-135). The tighten suite asserts this column is STILL NULLABLE, so a future
-- "tidy-up" cannot quietly close it.
alter table public.assessments
  add constraint assessments_case_required_when_owned
  check (case_id is not null or (owner is null and claimed_at is null));

-- =====================================================================
-- (d)  POLICY REWRITE — remove MV-159's transitional owner disjunct
-- =====================================================================
-- MV-159 shipped every policy on the nine tables as
--     owner = (select auth.uid())                       <- transitional, marked "MV-160 §D: delete"
--     or (case_id is not null and case_id = any (...))  <- the permanent case predicate
-- and said in four places that removing the first line is MV-160's job. This is that step. Every
-- policy below is re-created under the SAME NAME, SAME `to authenticated`, SAME USING/WITH CHECK
-- pairing and SAME helpers — only the marked line is gone.
--
-- WHY THE REMOVAL IS BEHAVIOUR-PRESERVING ON SELECT/UPDATE, written down rather than assumed. For
-- any row that can exist after (b): `owner` is either NULL — in which case `owner = uid()` is
-- `NULL = uid()`, never TRUE, so the row was already carried by the case branch alone — or non-NULL,
-- in which case (a)'s `mv155_assert_case_backfill()` has just PROVEN that `case_id` resolves to the
-- case with `organization_id IS NULL AND student_user_id = owner`, and `private.actor_case_ids()`
-- returns every case whose `student_user_id` is the actor. So `owner = uid()` IMPLIES the case
-- branch, and removing it removes nothing. Three preconditions, all checkable:
--   (i)   the NOT NULLs are applied first — step (b), above;
--   (ii)  the assert passed — step (a), above;
--   (iii) `private.actor_case_ids()`'s STUDENT-LINK arm is NOT gated on membership status.
-- (iii) is the fragile one and it is asserted directly in the suite: if a later edit ever gates that
-- arm, dropping the disjunct hides every personal student's own data from them and nothing else in
-- this migration would notice.
--
-- ON INSERT the two are NOT equivalent, and that asymmetry is a FIX rather than a regression. MV-159
-- round 2 already shipped the tightening itself, in the INSERT shape of the disjunct
-- (`owner = uid() and case_id is null`), because a cross-case INSERT admitted for the life of Stage 2
-- is a breach and not a tightening to schedule. By the time this migration runs, that arm is DEAD
-- (nothing can insert a case-less row into the eight any more) and its removal is a measured no-op.
--
-- >>> WHAT MUST SURVIVE THIS REWRITE, because deleting either re-opens a P0 <<<
--   1. THE OWNER-AXIS BOUND on the five INSERT WITH CHECKs:
--          owner is null or owner = private.case_student_id(case_id)
--      This is NOT the transitional disjunct and carries no "delete this line" marker. It is what
--      stops `owner = <a victim>, case_id = <the actor's own case>` — measured ADMITTED on all five
--      tables before it existed, planting a fabricated `visa_granted` outcome event of record in the
--      victim's data and permanently breaking their `document_status` checklist for a chosen kind
--      (23505 on `(owner, kind)`, which the `(case_id, kind)` arbiter cannot absorb). It is INVISIBLE
--      to every legitimate caller — every live writer derives `owner` from `cases.student_user_id` —
--      so only an attacker notices its absence. That is exactly why it is restated here in full.
--      NOTE THE DISTINCTION THIS CARD TURNS ON: `owner = auth.uid()` asks "is the ACTOR this row's
--      owner" (actor-equals-student, the assumption Stage 2 deletes). `owner = case_student_id(case_id)`
--      asks "is this row's owner the STUDENT OF THE CASE IT NAMES" — a statement about the ROW,
--      derived from `cases`, with no reference to the actor at all. The first goes; the second stays.
--   2. MV-161's PARENT-POINTER BOUNDS on `pp_insert_case` and `oe_insert_case`
--      (`supersedes_prediction_id` / `supersedes_event_id`). Same class, more so: nothing in `lib/`
--      or `app/` writes either column, so dropping them breaks no test that exercises a legitimate
--      path — and re-admits the plant that locked a victim's account deletion (P0001).
--   3. `oe_insert_case`'s two NON-OWNERSHIP integrity clauses, `source = 'self_reported'` and
--      `verified_by is null` (spec §4.9). They are what stop a client self-certifying an
--      `official_verified` outcome.
--   4. `assessments_select_case`'s `case_id is not null` guard. Its `case_id` stays nullable per (c),
--      so this is THE ONE TABLE where the null branch is still reachable. `case_id = any (…)` is
--      already NULL (not TRUE) for a null `case_id`, so the guard is belt-and-braces rather than
--      load-bearing — kept deliberately.

-- ---- profiles — spec §4.1 -------------------------------------------
drop policy if exists profiles_select_case on public.profiles;
create policy profiles_select_case on public.profiles
  for select to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

drop policy if exists profiles_update_case on public.profiles;
create policy profiles_update_case on public.profiles
  for update to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  )
  with check (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

-- ---- assessments — spec §4.2 ----------------------------------------
-- The `case_id is not null` guard is kept deliberately; see note 4 above. An unclaimed row is
-- `owner IS NULL AND case_id IS NULL` and must remain invisible to every authenticated client,
-- including the user about to claim it — the claim path is service-role (MV-158).
drop policy if exists assessments_select_case on public.assessments;
create policy assessments_select_case on public.assessments
  for select to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

-- ---- plan_items — spec §4.3 -----------------------------------------
drop policy if exists plan_items_select_case on public.plan_items;
create policy plan_items_select_case on public.plan_items
  for select to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

drop policy if exists plan_items_update_case on public.plan_items;
create policy plan_items_update_case on public.plan_items
  for update to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  )
  with check (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

-- ---- user_program_state — spec §4.4 ---------------------------------
drop policy if exists ups_select_case on public.user_program_state;
create policy ups_select_case on public.user_program_state
  for select to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

drop policy if exists ups_insert_case on public.user_program_state;
create policy ups_insert_case on public.user_program_state
  for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))   -- KEEP: round-3 owner axis
  );

drop policy if exists ups_update_case on public.user_program_state;
create policy ups_update_case on public.user_program_state
  for update to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  )
  with check (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

drop policy if exists ups_delete_case on public.user_program_state;
create policy ups_delete_case on public.user_program_state
  for delete to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

-- ---- documents — spec §4.5 ------------------------------------------
-- INSERT/UPDATE stay ungranted and unpolicied for `authenticated` (upload is service-role, a
-- registered exception; the header/versions replacement is Stage 4). The pre-existing
-- "Service inserts documents" policy is NOT one of MV-159's and is left exactly as it is.
drop policy if exists documents_select_case on public.documents;
create policy documents_select_case on public.documents
  for select to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

drop policy if exists documents_delete_case on public.documents;
create policy documents_delete_case on public.documents
  for delete to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

-- ---- document_status — spec §4.6 ------------------------------------
drop policy if exists ds_select_case on public.document_status;
create policy ds_select_case on public.document_status
  for select to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

drop policy if exists ds_insert_case on public.document_status;
create policy ds_insert_case on public.document_status
  for insert to authenticated
  with check (
    case_id is not null
    and case_id = any ((select private.actor_case_ids())::uuid[])
    and (owner is null or owner = private.case_student_id(case_id))   -- KEEP: round-3 owner axis
  );

drop policy if exists ds_update_case on public.document_status;
create policy ds_update_case on public.document_status
  for update to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  )
  with check (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

drop policy if exists ds_delete_case on public.document_status;
create policy ds_delete_case on public.document_status
  for delete to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

-- ---- program_predictions — spec §4.7 --------------------------------
-- NO UPDATE POLICY AND NO UPDATE GRANT, PERMANENTLY — immutability is enforced below the policy
-- layer by `private.reject_prediction_update()`, restored to its unconditional body in step (i).
drop policy if exists pp_select_case on public.program_predictions;
create policy pp_select_case on public.program_predictions
  for select to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

drop policy if exists pp_insert_case on public.program_predictions;
create policy pp_insert_case on public.program_predictions
  for insert to authenticated
  with check (
    (
      case_id is not null
      and case_id = any ((select private.actor_case_ids())::uuid[])
      and (owner is null or owner = private.case_student_id(case_id))   -- KEEP: round-3 owner axis
    )
    and private.assessment_case_id(assessment_id) = case_id
    -- KEEP: MV-161's parent-pointer axis. `is null or …` and not a bare `=`, because the pointer is
    -- nullable and NULL is the shape every legitimate insert carries today.
    and (
      supersedes_prediction_id is null
      or private.prediction_case_id(supersedes_prediction_id) = case_id
    )
  );

drop policy if exists pp_delete_case on public.program_predictions;
create policy pp_delete_case on public.program_predictions
  for delete to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

-- ---- application_attempts — spec §4.8 -------------------------------
drop policy if exists aa_select_case on public.application_attempts;
create policy aa_select_case on public.application_attempts
  for select to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

drop policy if exists aa_insert_case on public.application_attempts;
create policy aa_insert_case on public.application_attempts
  for insert to authenticated
  with check (
    (
      case_id is not null
      and case_id = any ((select private.actor_case_ids())::uuid[])
      and (owner is null or owner = private.case_student_id(case_id))   -- KEEP: round-3 owner axis
    )
    and private.prediction_case_id(prediction_id) = case_id
  );

drop policy if exists aa_delete_case on public.application_attempts;
create policy aa_delete_case on public.application_attempts
  for delete to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

-- ---- outcome_events — spec §4.9 -------------------------------------
drop policy if exists oe_select_case on public.outcome_events;
create policy oe_select_case on public.outcome_events
  for select to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

drop policy if exists oe_insert_case on public.outcome_events;
create policy oe_insert_case on public.outcome_events
  for insert to authenticated
  with check (
    (
      case_id is not null
      and case_id = any ((select private.actor_case_ids())::uuid[])
      and (owner is null or owner = private.case_student_id(case_id))   -- KEEP: round-3 owner axis
    )
    and private.attempt_case_id(attempt_id) = case_id
    and source = 'self_reported'      -- KEEP: spec §4.9, not an ownership clause
    and verified_by is null           -- KEEP: spec §4.9, not an ownership clause
    -- KEEP: MV-161's parent-pointer axis, through the self-referential helper.
    and (
      supersedes_event_id is null
      or private.outcome_event_case_id(supersedes_event_id) = case_id
    )
  );

drop policy if exists oe_delete_case on public.outcome_events;
create policy oe_delete_case on public.outcome_events
  for delete to authenticated
  using (
    case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[])
  );

-- =====================================================================
-- (e)  Drop ALL EIGHT `<table>_ownership_axis_present` checks
-- =====================================================================
-- MV-156's compensating check is `check (owner is not null or case_id is not null)` — the DISJUNCT,
-- deliberately, so the pre-MV-157 owner-only write path survived its window. Step (b) has just made
-- `case_id NOT NULL` on exactly these eight, which makes the disjunct's right branch unconditionally
-- true on every one of them. A check that can never fire is not a Stage 3 safeguard; it is a
-- constraint the next author reads as load-bearing and plans around. All eight go.
alter table public.profiles             drop constraint profiles_ownership_axis_present;
alter table public.plan_items           drop constraint plan_items_ownership_axis_present;
alter table public.user_program_state   drop constraint user_program_state_ownership_axis_present;
alter table public.documents            drop constraint documents_ownership_axis_present;
alter table public.document_status      drop constraint document_status_ownership_axis_present;
alter table public.program_predictions  drop constraint program_predictions_ownership_axis_present;
alter table public.application_attempts drop constraint application_attempts_ownership_axis_present;
alter table public.outcome_events       drop constraint outcome_events_ownership_axis_present;

-- =====================================================================
-- (f)  Drop the two LEGACY COMPOSITE FKs — before their targets, in (g)
-- =====================================================================
-- With `case_id` NOT NULL, MV-156's case-side FKs `(prediction_id, case_id) -> program_predictions
-- (id, case_id)` and `(attempt_id, case_id) -> application_attempts (id, case_id)` can no longer be
-- skipped by MATCH SIMPLE, so they now bite: an insert whose child `case_id` differs from its
-- parent's raises 23503. That is what makes these two redundant — and it is only true because (b)
-- ran first.
alter table public.application_attempts drop constraint application_attempts_prediction_id_owner_fkey;
alter table public.outcome_events       drop constraint outcome_events_attempt_id_owner_fkey;

-- =====================================================================
-- (g)  THEN their `unique (id, owner)` targets
-- =====================================================================
-- Dropping one of these while a composite FK still depends on it makes Postgres refuse the statement
-- outright (2BP01) and aborts the whole migration. This is the single most likely way this migration
-- fails on first apply, and (f) above is the reason it does not.
alter table public.program_predictions  drop constraint program_predictions_id_owner_key;
alter table public.application_attempts drop constraint application_attempts_id_owner_key;
alter table public.outcome_events       drop constraint outcome_events_id_owner_key;

-- =====================================================================
-- (h)  The orphaned covering index, then the SEVEN superseded owner-keyed uniqueness rules
-- =====================================================================
-- `outcome_events_attempt_id_owner_idx` covered the `(attempt_id, owner)` FK dropped in (f).
drop index if exists public.outcome_events_attempt_id_owner_idx;

-- The seven, each replaced by the case-keyed rule MV-155 §E introduced and MV-157 writes against.
-- Three are UNIQUE CONSTRAINTS and four are UNIQUE INDEXES — the catalog distinction matters,
-- because `drop constraint` and `drop index` are not interchangeable.
alter table public.profiles            drop constraint profiles_owner_key;                                    -- -> profiles_case_idx
alter table public.documents           drop constraint documents_owner_kind_key;                              -- -> documents_case_kind_idx
alter table public.program_predictions drop constraint program_predictions_owner_assessment_id_program_id_rule_ver_key;
                                                                                                              -- -> program_predictions_case_assessment_program_rule_idx
drop index if exists public.assessments_primary_idx;              -- -> assessments_case_primary_idx (where is_primary)
drop index if exists public.plan_items_kind_open_idx;             -- -> plan_items_case_kind_open_idx (where status='todo')
drop index if exists public.user_program_state_owner_program_idx; -- -> user_program_state_case_program_idx
drop index if exists public.document_status_owner_kind_idx;       -- -> document_status_case_kind_idx

-- =====================================================================
-- (i)  LAST — restore `private.reject_prediction_update()` to its ORIGINAL unconditional body
-- =====================================================================
-- Closes the handoff MV-155 §D opened and no card had accepted. MV-155 narrowed this trigger to
-- permit exactly one transition (`case_id` null -> not-null, every other column byte-identical) so
-- its backfill could run, and said twice that MV-160 restores it.
--
-- THIS IS THE LAST STATEMENT IN THE FILE AND THAT IS NOT A STYLE CHOICE: step (a)'s sweep UPDATEs
-- `program_predictions.case_id`, and only the narrowed body permits that update. Restore it before
-- the sweep and the migration aborts on its own reconciliation step, with an error that names the
-- immutability trigger rather than the ordering.
--
-- The narrowing is *self-closing* in the weak sense that `old.case_id is null` is unreachable once
-- `case_id` is NOT NULL — but "unreachable given a constraint on another object" is a weaker
-- guarantee than "the guard says no", and any later stage that re-widened `case_id` would silently
-- re-arm the allowance. SECURITY INVOKER, so `service_role` does not bypass it either; that is the
-- property 20260620000000 exists to guarantee and the suite asserts it for both roles.
create or replace function private.reject_prediction_update()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'program_predictions is immutable (no UPDATE permitted)';
end;
$$;
