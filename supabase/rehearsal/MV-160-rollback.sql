-- MV-160 — ROLLBACK. This is a SCRIPT, not a migration: it is never applied by
-- `supabase db push` and it carries no entry in supabase_migrations.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/rehearsal/MV-160-rollback.sql
--
-- Order is spec §10.1 **R1**, which is authoritative
-- (docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md):
--   1  re-create MV-159's policy set WITH THE TRANSITIONAL OWNER DISJUNCT RESTORED  ← FIRST
--   2  restore the NARROWED `private.reject_prediction_update()` body (MV-155 §D's)
--   3  drop the `assessments` CHECK
--   4  re-widen `case_id` to nullable on the eight
--   5  re-create the eight `<table>_ownership_axis_present` checks
--   6  re-create `unique (id, owner)` ×3, THEN the two legacy composite FKs, then the covering index
--   7  re-create ALL SEVEN legacy owner-keyed uniqueness rules
--   8  assert the restored state
--
-- The whole script is ONE transaction. Every `drop policy` + `create policy` pair below leaves a
-- table momentarily with fewer policies than it needs, and RLS is ENABLED AND FORCED on all nine —
-- a table with RLS forced and zero matching policies returns ZERO ROWS to every client, which is a
-- total, silent outage of the student-facing product. Inside one transaction no other session ever
-- observes that gap. Same argument, verbatim, as `MV-159-rollback.sql`.
--
-- NO `lock_timeout`, DELIBERATELY, and the two predecessors' silence on this is a decision rather
-- than an oversight. The migrations set one because an apply that stalls behind an open transaction
-- is worse than an apply that fails and is retried. An UNWIND inverts that: it is run during an
-- incident, and a `55P03 lock_not_available` at statement 40 of 60 means the operator retries the
-- whole thing under the same load that caused the timeout. Waiting for the lock is the better
-- failure here.
--
-- ============================ THE ORDER, AND THE ONE PLACE IT IS NOT A MIRROR ============================
--
-- MV-160's apply runs (a) sweep → (b) NOT NULL → (c) assessments CHECK → (d) policies → (e) drop
-- checks → (f) FKs → (g) targets → (h) uniques → (i) trigger body. A pure mirror would put the
-- policy restore near the END. **SPEC §10.1 R1 PUTS IT FIRST, AND THAT INVERSION IS THE WHOLE POINT
-- OF THE ROW.**
--
-- MV-160's policies are a PURE case predicate. This script re-widens `case_id` to nullable, and from
-- that instant a case-less row is expressible again. Under a pure case predicate,
-- `case_id = any (…)` against a NULL `case_id` is NULL, a USING clause admits only TRUE, and the row
-- is therefore INVISIBLE TO ITS OWN OWNER — with no error, no log line, and no way for the student
-- to tell the difference between "hidden" and "deleted". Restoring the transitional disjunct FIRST
-- means that window never opens. Restoring it afterwards means the window is exactly as long as the
-- rest of this script, which inside one transaction is zero — but "zero because of a property of the
-- enclosing transaction" is the kind of safety that survives until somebody splits the file.
--
-- Everything else IS a mirror, and two of the steps fail loudly if reordered:
--   * §6 re-creates `unique (id, owner)` BEFORE the composite FKs that reference them. Reversed,
--     Postgres refuses the FK with **42830** ("there is no unique constraint matching the given keys").
--   * §4 re-widens `case_id` and §5 re-creates the compensating checks. Re-widen WITHOUT re-creating
--     them and the MATCH SIMPLE hole on the three-table chain silently reopens — spec §10.1 R1 names
--     this as **the one step whose misordering does not fail loudly**. They are adjacent and in one
--     transaction for that reason; do not split them.
--
-- ============================ WHAT MUST SURVIVE THE POLICY RESTORE ============================
--
-- THIS IS THE SINGLE MOST LIKELY WAY THIS SCRIPT IS WRONG, and it is the failure mode a reverse
-- script is least tested for: a rollback is written by reading the FORWARD diff and undoing it, so
-- clauses that were never part of that diff get dropped on the way back without anyone noticing.
-- MV-160 §D re-created 24 predicates and deleted exactly one line from each. This script re-creates
-- the same 24 and PUTS THAT LINE BACK — it deletes nothing. Four families of clause therefore have
-- to come back with them, and each one is a live P0 if it does not:
--
--   (a) THE OWNER-AXIS BOUND on the five INSERT `WITH CHECK`s —
--       `owner is null or owner = private.case_student_id(case_id)` (MV-159 round 3).
--       Without it, `owner = <a victim>, case_id = <the actor's own case>` is ADMITTED on all five
--       tables: a fabricated `visa_granted` outcome event of record in the victim's data, and a
--       permanently broken `document_status` checklist for a chosen kind (23505 on `(owner, kind)`,
--       which the `(case_id, kind)` arbiter cannot absorb and the case-scoped heal path cannot see).
--       INVISIBLE to every legitimate caller — every live writer derives `owner` from
--       `cases.student_user_id` — so only an attacker notices its absence.
--       **AND THIS SCRIPT RE-CREATES `document_status_owner_kind_idx` IN §7**, which is the very
--       index that plant collides with. Dropping (a) while restoring that index re-arms the exact
--       pair MV-159 round 3 measured.
--   (b) MV-161's PARENT-POINTER BOUNDS on `pp_insert_case` / `oe_insert_case`
--       (`supersedes_prediction_id` / `supersedes_event_id`). Same class, more so: NOTHING in `lib/`
--       or `app/` writes either column, so dropping them breaks no test that exercises a legitimate
--       path and no live write — the suite stays green, production keeps working, and the victim's
--       `/api/account/delete` raises `P0001` forever on a row they cannot see.
--       **MV-161 IS NOT BEING UNWOUND HERE.** It landed after spec §10.1's table was written and has
--       no row of its own; it is a P0 fix that sits ON TOP of MV-159 and must survive R1 untouched.
--       Its helper `private.outcome_event_case_id()` is likewise not dropped.
--   (c) `oe_insert_case`'s two NON-OWNERSHIP integrity clauses, `source = 'self_reported'` and
--       `verified_by is null` (spec §4.9) — the difference between "the student says they were
--       granted a visa" and "the record says a decision authority did".
--   (d) `assessments_select_case`'s `case_id is not null` guard. `assessments.case_id` is nullable on
--       BOTH sides of this script, so it is the one table where the null branch is genuinely
--       reachable and an unclaimed anonymous row must stay invisible to every authenticated client.
--
-- §8's closing block asserts all four by measurement rather than trusting this comment, and MV-159
-- §13 (4) / MV-161 §4 assert the same sentences at their own apply time — so a re-apply of the
-- forward migrations after this script would also catch a restore that dropped one.
--
-- ============================ ITS PREDECESSOR, AND ITS HARD EXPIRY ============================
--
-- VALID PREDECESSOR STATE: **Stage 2 fully applied — MV-160 applied and R2 (MV-159's rollback) NOT
-- yet run.** Guards 0-1 check both against the DATABASE rather than trusting the operator. R1 runs
-- FIRST in the reverse sweep; if MV-159's helpers are already gone, this script cannot re-create the
-- policies at all and refuses rather than emitting a pile of 42883s an operator has to interpret.
--
-- **THE HARD EXPIRY IS §7, NOT §4, AND IT IS STAGE 3's.** Everything above §7 is pure DDL over a
-- schema whose shape is fixed. §7 re-creates seven UNIQUENESS RULES ON `owner`, and a uniqueness
-- rule can only be re-created if the data still satisfies it. The moment Stage 3 gives one student
-- rows under two cases — a personal case AND a consultancy client case, which is the whole point of
-- Stage 3 and is expressible the instant MV-160 lands — `profiles_owner_key UNIQUE (owner)` has two
-- rows to reconcile and raises **23505**. The same holds for the other six. Guard 3 checks all seven
-- up front and names every offender, so the operator learns the FULL extent before anything is
-- unwound, rather than discovering it as a bare 23505 on the fifth index inside a transaction they
-- now have to abort. From that point the recovery path is spec §10.2's: a restore from backup, which
-- is a founder decision rather than an operator one.
--
-- POINT OF NO RETURN, STATED PLAINLY: there isn't one for THIS script. **It mutates no row.** MV-160
-- deliberately shipped no `DROP COLUMN` and no `DELETE` precisely so its unwind would be a pure DDL
-- re-application with no data moving in either direction (MV-160's own header says so), which is why
-- this file can be run, re-run, and rolled forward again. The stage's real expiries are below it:
-- R5's `SET NOT NULL` on `owner` and R6's personal-case delete.
--
-- WHAT IT DELIBERATELY DOES NOT DO:
--   * IT DOES NOT DROP THE CASE-KEYED RULES MV-155 §E ADDED. `profiles_case_idx`,
--     `assessments_case_primary_idx`, `plan_items_case_kind_open_idx`,
--     `user_program_state_case_program_idx`, `document_status_case_kind_idx`,
--     `program_predictions_case_assessment_program_rule_idx` and the case-side chain all survive.
--     Both families coexisted for the whole MV-155 → MV-160 window; landing back in that window is
--     exactly what this script is for. They are R6's to remove, with the column.
--   * IT DOES NOT TOUCH MV-161. See (b) above.
--   * IT DOES NOT TOUCH `supabase_migrations.schema_migrations`. That is the operator's step and it
--     is written out at the foot of this file, for the reason MV-155, MV-156 and MV-159 each learned
--     the hard way.
--   * NO `cascade` ANYWHERE. If something unexpected depends on an object below, the correct outcome
--     is a loud abort, not a silent removal of whatever that was.
--
-- ============================ ONE THING THIS FILE CANNOT CLAIM, SAID OUT LOUD ============================
--
-- `MV-159-rollback.sql` closes with a MEASURED md5 fingerprint of the restored catalogue, which is
-- what turns "the rollback ran" into "the rollback restored". **THIS FILE CARRIES NO SUCH LITERAL,
-- AND THE OMISSION IS DELIBERATE RATHER THAN AN OVERSIGHT.** That constant was produced by resetting
-- a stack with the migration moved out of `supabase/migrations/` and hashing `pg_get_expr` output;
-- it is a MEASUREMENT, and a retyped or guessed hash is worse than no hash at all — it would fire on
-- every legitimate run and teach the operator to edit the constant to match, which converts the one
-- check that proves restoration into ceremony. §8 asserts the restored SHAPE structurally instead,
-- clause family by clause family. **When this script is first rehearsed, capture the fingerprint the
-- same way MV-159's was and add it here** — the procedure is `supabase/rehearsal/README.md`
-- §"Rolling MV-159 back in production", and the baseline to hash is a stack reset with
-- `20260805140000_stage2_tighten_case_mandatory.sql` moved aside, i.e. the true pre-MV-160 state.

\set ON_ERROR_STOP on

begin;

-- =====================================================================
-- Guard 0 — MV-160 is applied, and applied WHOLE
-- =====================================================================
-- Four independent facts, because a half-applied MV-160 is a state neither the migration nor this
-- script describes, and unwinding it piecemeal produces a fifth. `case_id NOT NULL` is the headline,
-- but the drop lists are what make the re-creations below meaningful: re-creating a check or a unique
-- that never went away is a no-op at best and a duplicate-name error at worst.
do $$
declare
  v_notnull  int;
  v_checks   int;
  v_assess   int;
  v_legacy   text;
begin
  select count(*) into v_notnull
    from information_schema.columns
   where table_schema = 'public' and column_name = 'case_id' and is_nullable = 'NO'
     and table_name in ('profiles','plan_items','user_program_state','documents','document_status',
                        'program_predictions','application_attempts','outcome_events');
  if v_notnull = 0 then
    raise exception 'MV-160 rollback REFUSED: `case_id` is nullable on all eight, so MV-160 does not '
      'appear to be applied. Nothing to unwind. (To unwind MV-159, use '
      'supabase/rehearsal/MV-159-rollback.sql; to unwind MV-156, MV-156-rollback.sql.)';
  end if;
  if v_notnull <> 8 then
    raise exception 'MV-160 rollback REFUSED: `case_id` is NOT NULL on % of the eight, not 8. MV-160 '
      'is half-applied — which its all-or-nothing apply path makes impossible, so the schema has been '
      'hand-edited. Investigate before unwinding.', v_notnull;
  end if;

  -- `assessments` is the deliberate ninth exception: its column STAYS nullable and the rule is a
  -- CHECK instead (MV-160 (c)). A NOT NULL here means somebody "tidied up" the exception and
  -- destroyed the anonymous rows in the process — a failure wearing a success's clothes.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'assessments'
                and column_name = 'case_id' and is_nullable = 'NO') then
    raise exception 'MV-160 rollback REFUSED: `assessments.case_id` is NOT NULL. MV-160 never sets '
      'that — an anonymous, unclaimed assessment is case-less BY DESIGN until claimed (MV-158) or '
      'purged (MV-135). Whatever set it has already destroyed or re-pointed those rows; this script '
      'cannot put them back and will not paper over it.';
  end if;

  select count(*) into v_assess from pg_constraint
   where conname = 'assessments_case_required_when_owned' and contype = 'c';
  if v_assess <> 1 then
    raise exception 'MV-160 rollback REFUSED: the `assessments_case_required_when_owned` CHECK is '
      'missing, so MV-160 (c) has not run or has been partially undone. Investigate before unwinding.';
  end if;

  select count(*) into v_checks from pg_constraint where conname like '%\_ownership\_axis\_present';
  if v_checks <> 0 then
    raise exception 'MV-160 rollback REFUSED: % `_ownership_axis_present` check(s) still exist, so '
      'MV-160 (e) has not run. §5 below would then fail on a duplicate constraint name. If you are '
      'trying to unwind MV-156, use supabase/rehearsal/MV-156-rollback.sql.', v_checks;
  end if;

  -- The seven owner-keyed uniqueness rules §7 re-creates, and the chain objects §6 re-creates, must
  -- all be ABSENT. Any survivor means MV-160 (f)/(g)/(h) ran partially.
  select string_agg(relname, ', ' order by relname) into v_legacy from pg_class
   where relname in ('profiles_owner_key','documents_owner_kind_key',
                     'program_predictions_owner_assessment_id_program_id_rule_ver_key',
                     'assessments_primary_idx','plan_items_kind_open_idx',
                     'user_program_state_owner_program_idx','document_status_owner_kind_idx',
                     'program_predictions_id_owner_key','application_attempts_id_owner_key',
                     'outcome_events_id_owner_key','outcome_events_attempt_id_owner_idx');
  if v_legacy is not null then
    raise exception 'MV-160 rollback REFUSED: legacy owner-keyed object(s) still present: %. MV-160''s '
      'drop list has only partially run, and re-creating them below would raise 42P07/42710.', v_legacy;
  end if;
end;
$$;

-- =====================================================================
-- Guard 1 — R2 has NOT run: MV-159's + MV-161's policy set and helpers are intact
-- =====================================================================
-- Spec §10.1 unwinds strictly reverse-DAG, R1 before R2. If R2 has already run, the 24 case policies
-- are gone, the legacy owner-only set is back, and the six `private` helpers §1 below references have
-- been dropped — so every `create policy` would raise 42883 and the operator would be reading
-- "function private.actor_case_ids() does not exist" instead of "you ran these in the wrong order".
--
-- SIX HELPERS, NOT FIVE: MV-161 added `private.outcome_event_case_id()` and this script's
-- `oe_insert_case` calls it. Counted rather than assumed, for the reason MV-159's Guard 1 gives.
do $$
declare
  v_policies int;
  v_helpers  int;
  v_stage3   text;
begin
  -- MV-168 ADDED THREE MORE `%_case` POLICIES, NAMED TO THE SAME CONVENTION, so the count below
  -- reads 27 on a Stage 3 database and this guard refuses — correctly, because the database is
  -- then not in the state this script was written against. Named explicitly and checked FIRST so
  -- the operator reads an instruction instead of decoding a count. Stage 3 unwinds before Stage 2:
  --   MV-168-rollback → MV-160-rollback (R1) → MV-159-rollback (R2).
  -- `MV-161-rollback.sql` is NOT a step in that chain. This script keeps MV-161's P0 pointer bound
  -- ON PURPOSE — the header above says so and §8 asserts it survived — and MV-161-rollback's own
  -- Guard 1 refuses until THIS script has already run. Its only sanctioned position is between R1
  -- and R2 on an offline rehearsal host (`docs/migrations/stage2/equivalence-report.md` §3.1).
  select string_agg(p.polname, ', ' order by p.polname) into v_stage3
    from pg_policy p
   where p.polname in ('profiles_insert_case', 'plan_items_insert_case', 'assessments_update_case');
  if v_stage3 is not null then
    raise exception 'MV-160 rollback REFUSED: Stage 3 is still applied — % present. Run '
      'supabase/rehearsal/MV-168-rollback.sql FIRST (Stage 3 unwinds before Stage 2), then this '
      'script. Unwinding Stage 2 underneath a live Stage 3 grant would leave `authenticated` '
      'holding INSERT on profiles/plan_items with the policy set restored to a shape that never '
      'expected it.', v_stage3;
  end if;

  select count(*) into v_policies
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polname like '%\_case';
  if v_policies <> 24 then
    raise exception 'MV-160 rollback REFUSED: expected 24 *_case policies on the nine student tables, '
      'found %. Either MV-159''s rollback (R2) has already run — in which case this script is out of '
      'order, spec §10.1 unwinds R1 then R2 — or the policy set has been hand-edited.', v_policies;
  end if;

  select count(*) into v_helpers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('actor_case_ids', 'assessment_case_id', 'prediction_case_id',
                       'attempt_case_id', 'case_student_id', 'outcome_event_case_id');
  if v_helpers <> 6 then
    raise exception 'MV-160 rollback REFUSED: expected 6 case helpers in schema private (MV-159''s '
      'five plus MV-161''s outcome_event_case_id), found %. The policies restored below call all six; '
      'without them every create raises 42883.', v_helpers;
  end if;
end;
$$;

-- =====================================================================
-- Guard 2 — §6's composite FKs are re-creatable: no owner-divergent child row
-- =====================================================================
-- `foreign key (prediction_id, owner) references program_predictions (id, owner)` is MATCH SIMPLE, so
-- a child whose `owner` is NULL is satisfied without any lookup — a pure consultancy chain re-creates
-- fine. What raises **23503** is a child with a NON-NULL owner whose parent does not carry that same
-- owner, which is exactly what a partial or lost dual-write leaves behind. Checked here, with counts,
-- rather than surfacing as a bare 23503 at statement 50 that names neither table nor row.
do $$
declare
  v_aa int;
  v_oe int;
begin
  select count(*) into v_aa
    from public.application_attempts a
   where a.owner is not null
     and not exists (select 1 from public.program_predictions p
                      where p.id = a.prediction_id and p.owner = a.owner);
  select count(*) into v_oe
    from public.outcome_events e
   where e.owner is not null
     and not exists (select 1 from public.application_attempts a
                      where a.id = e.attempt_id and a.owner = e.owner);
  if v_aa > 0 or v_oe > 0 then
    raise exception 'MV-160 rollback REFUSED: the legacy composite owner FKs cannot be re-created — '
      '% application_attempts row(s) and % outcome_events row(s) carry a non-null `owner` that does '
      'not match their parent''s. §6 would raise 23503 mid-unwind. These rows have to be reconciled '
      'or re-owned FIRST, as a separate decision with its own record.', v_aa, v_oe;
  end if;
end;
$$;

-- =====================================================================
-- Guard 3 — THE HARD EXPIRY: §7's seven owner-keyed uniqueness rules
-- =====================================================================
-- This is the guard that decides whether Stage 2 is still reversible. Each of the seven held before
-- MV-160 and is re-creatable only if the data STILL satisfies it. `owner IS NULL` rows are irrelevant
-- — NULLs are distinct in a unique index, which is the property that let MV-156's replacement uniques
-- be FULL — so the filter is `owner is not null` throughout, and the partial rules are checked under
-- their own index predicate (`where is_primary`, `where status = 'todo'`) or the answer is wrong.
--
-- THE SHAPE THAT ENDS THIS WINDOW: one student holding rows under TWO cases — their personal case and
-- a consultancy client case — with `owner` set on both, which MV-157's dual-write does whenever
-- `cases.student_user_id` is populated. That is not an edge case, it is Stage 3's product. All seven
-- are reported at once so the operator sees the full extent before a single object is unwound.
do $$
declare
  v_offenders text;
begin
  select string_agg(msg, '; ' order by msg) into v_offenders from (
    select 'profiles_owner_key: ' || count(*)::text || ' duplicate (owner)' as msg
      from (select owner from public.profiles
             where owner is not null group by owner having count(*) > 1) d having count(*) > 0
    union all
    select 'documents_owner_kind_key: ' || count(*)::text || ' duplicate (owner, kind)'
      from (select owner, kind from public.documents
             where owner is not null group by owner, kind having count(*) > 1) d having count(*) > 0
    union all
    select 'program_predictions_owner_assessment_id_program_id_rule_ver_key: ' || count(*)::text
           || ' duplicate (owner, assessment_id, program_id, rule_version)'
      from (select owner, assessment_id, program_id, rule_version from public.program_predictions
             where owner is not null
             group by owner, assessment_id, program_id, rule_version having count(*) > 1) d having count(*) > 0
    union all
    select 'assessments_primary_idx: ' || count(*)::text || ' owners with >1 primary assessment'
      from (select owner from public.assessments
             where owner is not null and is_primary group by owner having count(*) > 1) d having count(*) > 0
    union all
    select 'plan_items_kind_open_idx: ' || count(*)::text || ' duplicate open (owner, kind)'
      from (select owner, kind from public.plan_items
             where owner is not null and status = 'todo'
             group by owner, kind having count(*) > 1) d having count(*) > 0
    union all
    select 'user_program_state_owner_program_idx: ' || count(*)::text || ' duplicate (owner, program_id)'
      from (select owner, program_id from public.user_program_state
             where owner is not null group by owner, program_id having count(*) > 1) d having count(*) > 0
    union all
    select 'document_status_owner_kind_idx: ' || count(*)::text || ' duplicate (owner, kind)'
      from (select owner, kind from public.document_status
             where owner is not null group by owner, kind having count(*) > 1) d having count(*) > 0
  ) s;

  if v_offenders is not null then
    raise exception 'MV-160 rollback REFUSED — THE R1 ROLLBACK WINDOW HAS CLOSED. The legacy '
      'owner-keyed uniqueness rules can no longer be re-created: %. §7 would raise 23505 mid-unwind. '
      'The usual cause is exactly what Stage 2 exists to enable — one student carrying rows under '
      'both a personal case and a consultancy client case, both with `owner` set. Reconciling that '
      'means DELETING or RE-OWNING real student data, which is a founder decision, not an operator '
      'one; see the Stage 2 matrix spec §10.2, where the recovery path from here is a restore from '
      'backup.', v_offenders;
  end if;
end;
$$;

-- =====================================================================
-- 1  re-create MV-159's policy set WITH THE TRANSITIONAL OWNER DISJUNCT RESTORED — FIRST
-- =====================================================================
-- Every predicate below is MV-160 §D's, with the ONE line MV-160 deleted put back, in the shape and
-- position MV-159 shipped it and MV-161 preserved it. The marker comment comes back with the line:
-- it is what makes a re-apply of MV-160 a one-line deletion per predicate again, which is the
-- property MV-159's header spent a paragraph establishing and the reason MV-160 got it right.
--
-- TWO SHAPES, and the split is MV-159's round-2 security fix, not a formatting accident:
--   READ / UPDATE / DELETE (19 predicates)   `owner = (select auth.uid())`
--   INSERT (5 predicates)                    `(owner = (select auth.uid()) and case_id is null)`
-- The INSERT form's `and case_id is null` is load-bearing: without it, naming YOURSELF as owner
-- satisfies the arm unconditionally, whatever case the row names, and a user who cannot SELECT
-- another user's assessment can hang a prediction-of-record off it. Restoring the READ shape onto an
-- INSERT predicate would re-open that hole in the name of a rollback.
--
-- `drop policy if exists` + `create policy` throughout — MV-159 §2's idiom, and it is what keeps this
-- file re-runnable in the same way the migrations are.

-- ---- profiles — spec §4.1 -------------------------------------------
drop policy if exists profiles_select_case on public.profiles;
create policy profiles_select_case on public.profiles
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

drop policy if exists profiles_update_case on public.profiles;
create policy profiles_update_case on public.profiles
  for update to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  )
  with check (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- ---- assessments — spec §4.2 ----------------------------------------
-- The `case_id is not null` guard is kept, and on THIS table it is not belt-and-braces the way it is
-- on the other eight: `assessments.case_id` is nullable on both sides of this script, so an unclaimed
-- anonymous row (`owner IS NULL AND case_id IS NULL`) is a shape that genuinely exists. It matches
-- neither disjunct — `NULL = uid` is NULL, and `case_id is not null` is false — which is what keeps
-- it invisible to every authenticated client, including the user about to claim it. The claim path is
-- service-role (MV-158) and the purge predicate is `owner is null` (MV-135); both are unaffected.
drop policy if exists assessments_select_case on public.assessments;
create policy assessments_select_case on public.assessments
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- ---- plan_items — spec §4.3 -----------------------------------------
drop policy if exists plan_items_select_case on public.plan_items;
create policy plan_items_select_case on public.plan_items
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

drop policy if exists plan_items_update_case on public.plan_items;
create policy plan_items_update_case on public.plan_items
  for update to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  )
  with check (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- ---- user_program_state — spec §4.4 ---------------------------------
-- The INSERT `WITH CHECK` restores the transitional arm AND keeps the owner-axis bound inside the
-- case arm. See the header, (a): the two are not alternatives, and the case arm's third conjunct is
-- the only thing standing between `owner = <a victim>, case_id = <the actor's own case>` and a row of
-- record in the victim's data.
drop policy if exists ups_select_case on public.user_program_state;
create policy ups_select_case on public.user_program_state
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

drop policy if exists ups_insert_case on public.user_program_state;
create policy ups_insert_case on public.user_program_state
  for insert to authenticated
  with check (
    (owner = (select auth.uid()) and case_id is null)                           -- MV-160 §D: delete this line
    or (
      case_id is not null
      and case_id = any ((select private.actor_case_ids())::uuid[])
      and (owner is null or owner = private.case_student_id(case_id))           -- KEEP: round-3 owner axis
    )
  );

drop policy if exists ups_update_case on public.user_program_state;
create policy ups_update_case on public.user_program_state
  for update to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  )
  with check (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

drop policy if exists ups_delete_case on public.user_program_state;
create policy ups_delete_case on public.user_program_state
  for delete to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- ---- documents — spec §4.5 ------------------------------------------
-- BOTH KEEP `to authenticated`. Unlike `MV-159-rollback.sql` — which deliberately restores the
-- pre-Stage-2 `documents` policies with NO `to` clause, i.e. with the PUBLIC-role defect MV-159 fixed
-- — there is nothing to restore here: the shape this script puts back IS MV-159's, and MV-159's
-- shape carries the role. The `"Service inserts documents"` policy is not MV-159's and is untouched.
drop policy if exists documents_select_case on public.documents;
create policy documents_select_case on public.documents
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

drop policy if exists documents_delete_case on public.documents;
create policy documents_delete_case on public.documents
  for delete to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- ---- document_status — spec §4.6 ------------------------------------
-- THE TABLE THE ROUND-3 MIRROR HURT MOST, and the one §7 below re-arms the collision surface for: it
-- re-creates `document_status_owner_kind_idx (owner, kind)`, which is the index a planted
-- `(owner = <victim>, kind = …)` row collides with. The victim's own `setObtained` upsert arbitrates
-- on `(case_id, kind)` and cannot absorb a 23505 on `(owner, kind)`, and its heal path is case-scoped
-- so it can neither see nor remove the planted row. The owner-axis conjunct below is what stops the
-- plant; do not drop one without the other.
drop policy if exists ds_select_case on public.document_status;
create policy ds_select_case on public.document_status
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

drop policy if exists ds_insert_case on public.document_status;
create policy ds_insert_case on public.document_status
  for insert to authenticated
  with check (
    (owner = (select auth.uid()) and case_id is null)                           -- MV-160 §D: delete this line
    or (
      case_id is not null
      and case_id = any ((select private.actor_case_ids())::uuid[])
      and (owner is null or owner = private.case_student_id(case_id))           -- KEEP: round-3 owner axis
    )
  );

drop policy if exists ds_update_case on public.document_status;
create policy ds_update_case on public.document_status
  for update to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  )
  with check (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

drop policy if exists ds_delete_case on public.document_status;
create policy ds_delete_case on public.document_status
  for delete to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- ---- program_predictions — spec §4.7 --------------------------------
-- NO UPDATE POLICY AND NO UPDATE GRANT, on either side of this script. Immutability is enforced below
-- the policy layer by `private.reject_prediction_update()`, which §2 puts back in its NARROWED form.
--
-- `pp_insert_case` IS MV-161'S SHAPE, NOT MV-159'S — the pointer conjunct is the last clause and it
-- stays. See the header, (b): MV-161 is not being unwound here, and its clause is the one a reverse
-- script drops without noticing because no legitimate writer would ever miss it.
drop policy if exists pp_select_case on public.program_predictions;
create policy pp_select_case on public.program_predictions
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

drop policy if exists pp_insert_case on public.program_predictions;
create policy pp_insert_case on public.program_predictions
  for insert to authenticated
  with check (
    (
      (owner = (select auth.uid()) and case_id is null)                         -- MV-160 §D: delete this line
      or (
        case_id is not null
        and case_id = any ((select private.actor_case_ids())::uuid[])
        and (owner is null or owner = private.case_student_id(case_id))         -- KEEP: round-3 owner axis
      )
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
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- ---- application_attempts — spec §4.8 -------------------------------
-- `private.prediction_case_id(prediction_id) = case_id` is retained, and after §4 re-widens `case_id`
-- it becomes load-bearing again in a way it is not under MV-160: MV-156's case-side composite FK says
-- the same thing structurally but is MATCH SIMPLE, so it is satisfied without any lookup the moment
-- `case_id` can be NULL. This clause is what bites for the whole re-opened window.
drop policy if exists aa_select_case on public.application_attempts;
create policy aa_select_case on public.application_attempts
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

drop policy if exists aa_insert_case on public.application_attempts;
create policy aa_insert_case on public.application_attempts
  for insert to authenticated
  with check (
    (
      (owner = (select auth.uid()) and case_id is null)                         -- MV-160 §D: delete this line
      or (
        case_id is not null
        and case_id = any ((select private.actor_case_ids())::uuid[])
        and (owner is null or owner = private.case_student_id(case_id))         -- KEEP: round-3 owner axis
      )
    )
    and private.prediction_case_id(prediction_id) = case_id
  );

drop policy if exists aa_delete_case on public.application_attempts;
create policy aa_delete_case on public.application_attempts
  for delete to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- ---- outcome_events — spec §4.9 -------------------------------------
-- `oe_insert_case` IS MV-161'S SHAPE. Four things other than the ownership group survive here and all
-- four are in the header: the attempt parentage clause, `source = 'self_reported'`, `verified_by is
-- null`, and MV-161's self-referential pointer bound. The two integrity clauses are what stop a
-- client self-certifying an `official_verified` outcome of record; re-typing the whole predicate to
-- restore one line is exactly how they get lost, which is why §8 asserts them by name.
drop policy if exists oe_select_case on public.outcome_events;
create policy oe_select_case on public.outcome_events
  for select to authenticated
  using (
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

drop policy if exists oe_insert_case on public.outcome_events;
create policy oe_insert_case on public.outcome_events
  for insert to authenticated
  with check (
    (
      (owner = (select auth.uid()) and case_id is null)                         -- MV-160 §D: delete this line
      or (
        case_id is not null
        and case_id = any ((select private.actor_case_ids())::uuid[])
        and (owner is null or owner = private.case_student_id(case_id))         -- KEEP: round-3 owner axis
      )
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
    owner = (select auth.uid())                                                 -- MV-160 §D: delete this line
    or (case_id is not null and case_id = any ((select private.actor_case_ids())::uuid[]))
  );

-- =====================================================================
-- 2  restore the NARROWED `private.reject_prediction_update()` body (MV-155 §D's)
-- =====================================================================
-- MV-160 (i) restored the UNCONDITIONAL body and made it the LAST statement of the file, because
-- (a)'s reconciliation sweep UPDATEs `program_predictions.case_id` and only the narrowed body permits
-- that. On the way back it is therefore the FIRST thing restored after the policies, and before any
-- structure is unwound: it must be live at the instant this database is once again a database whose
-- `case_id` backfill can run.
--
-- WHY IT IS NOT ENOUGH THAT NOTHING BETWEEN HERE AND R6 UPDATES THIS TABLE. It is true that no
-- statement below writes a row. The reason to restore it anyway is ROLL-FORWARD-AGAIN — the property
-- every rehearsal in this directory is graded on ("a rollback tested in only one direction has not
-- been tested"). Re-applying MV-160 after this script runs its step (a) sweep against whatever
-- residue exists; with the unconditional body live, that sweep aborts on the immutability trigger and
-- the error names the trigger rather than the ordering. Leaving the unconditional body would make the
-- forward migration un-re-appliable on any database that had ever been rolled back and had residue,
-- which is precisely the state a rollback exists to produce.
--
-- Transcribed from `20260802120000_stage2_case_id_and_personal_cases.sql` §4. SECURITY INVOKER is
-- preserved by the OMISSION of `security definer` — that is the property `20260620000000` exists to
-- guarantee (the guard must raise for `service_role` too), and `set search_path = ''` is RESTATED
-- because `create or replace function` does not inherit the previous definition's configuration.
create or replace function private.reject_prediction_update()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.case_id is null
     and new.case_id is not null
     and (to_jsonb(new) - 'case_id'::text) = (to_jsonb(old) - 'case_id'::text)
     and exists (
           select 1
             from public.cases c
            where c.id = new.case_id
              and c.organization_id is null
              and c.student_user_id = new.owner
         ) then
    return new;
  end if;
  raise exception 'program_predictions is immutable (no UPDATE permitted)';
end;
$$;

-- =====================================================================
-- 3  drop the `assessments` CHECK
-- =====================================================================
-- MV-160 (c)'s `check (case_id is not null or (owner is null and claimed_at is null))`. It is the one
-- object MV-160 ADDED rather than removed, so it is the one object this script drops rather than
-- creates. It goes before §4 purely so the two "the tighten is undone" statements are adjacent and
-- read as one unit; nothing depends on the order, because it constrains `assessments` and §4 touches
-- the other eight.
alter table public.assessments drop constraint assessments_case_required_when_owned;

-- =====================================================================
-- 4  re-widen `case_id` to nullable on the eight
-- =====================================================================
-- The moment this runs, a case-less row is expressible again on all eight — which is why §1 restored
-- the transitional disjunct BEFORE it and not after. Eight, not nine: `assessments.case_id` was never
-- made NOT NULL (MV-160 (c)), so there is nothing to widen there.
alter table public.profiles             alter column case_id drop not null;
alter table public.plan_items           alter column case_id drop not null;
alter table public.user_program_state   alter column case_id drop not null;
alter table public.documents            alter column case_id drop not null;
alter table public.document_status      alter column case_id drop not null;
alter table public.program_predictions  alter column case_id drop not null;
alter table public.application_attempts alter column case_id drop not null;
alter table public.outcome_events       alter column case_id drop not null;

-- =====================================================================
-- 5  re-create the eight `<table>_ownership_axis_present` checks
-- =====================================================================
-- **THE STEP WHOSE OMISSION DOES NOT FAIL LOUDLY** (spec §10.1 R1). §4 has just made `case_id`
-- nullable again; MV-156's case-side composite FKs are MATCH SIMPLE and are therefore satisfied
-- WITHOUT ANY LOOKUP whenever `case_id` is NULL. Without these checks, a row with both ownership axes
-- NULL is expressible on all eight, the chain constraint enforces nothing, and NOTHING COMPLAINS —
-- spec §10.2's first property ("there is never an instant, mid-unwind, where a row is unconstrained
-- on both axes") is what this step, adjacent to §4 and inside the same transaction, exists to hold.
--
-- `add … not valid` then `validate` in two statements, mirroring MV-156 §4/§6 exactly. Inside one
-- transaction the split buys no lock relief — the ACCESS EXCLUSIVE from the ADD is held to COMMIT and
-- the verification scan runs underneath it — and it is retained for MV-156's own stated reasons: it
-- costs nothing, it is the shape spec §10.1 R1 names, and it makes the forward and reverse files read
-- as mirrors. The scan is trivial: every row currently carries a non-null `case_id`.
alter table public.profiles
  add constraint profiles_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.profiles validate constraint profiles_ownership_axis_present;

alter table public.plan_items
  add constraint plan_items_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.plan_items validate constraint plan_items_ownership_axis_present;

alter table public.user_program_state
  add constraint user_program_state_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.user_program_state validate constraint user_program_state_ownership_axis_present;

alter table public.documents
  add constraint documents_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.documents validate constraint documents_ownership_axis_present;

alter table public.document_status
  add constraint document_status_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.document_status validate constraint document_status_ownership_axis_present;

alter table public.program_predictions
  add constraint program_predictions_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.program_predictions validate constraint program_predictions_ownership_axis_present;

alter table public.application_attempts
  add constraint application_attempts_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.application_attempts validate constraint application_attempts_ownership_axis_present;

alter table public.outcome_events
  add constraint outcome_events_ownership_axis_present
  check (owner is not null or case_id is not null) not valid;
alter table public.outcome_events validate constraint outcome_events_ownership_axis_present;

-- `public.assessments` is deliberately NOT in this family, on the way back exactly as on the way in
-- (MV-156 §6): an unclaimed anonymous assessment IS `owner IS NULL AND case_id IS NULL`, so this
-- disjunct would reject the shape MV-135's 3-day purge exists to collect. Eight, never nine.

-- =====================================================================
-- 6  `unique (id, owner)` ×3, THEN the two composite FKs, THEN the covering index
-- =====================================================================
-- **THE TARGETS BEFORE THE FKs, ALWAYS.** MV-160 (f)/(g) dropped the FKs first and the targets
-- second, for the 2BP01 reason; the reverse is the reverse, and reversing THIS reverse raises
-- **42830** ("there is no unique constraint matching the given keys for referenced table") and aborts
-- the unwind. Explicitly named rather than left to Postgres's auto-namer, so a catalogue diff against
-- the pre-MV-160 baseline compares names as well as shapes.
alter table public.program_predictions
  add constraint program_predictions_id_owner_key unique (id, owner);
alter table public.application_attempts
  add constraint application_attempts_id_owner_key unique (id, owner);
alter table public.outcome_events
  add constraint outcome_events_id_owner_key unique (id, owner);

-- The legacy owner chain (`20260620000000` S12): an attempt's owner cannot diverge from its
-- prediction's, and an event's cannot diverge from its attempt's. Guard 2 has already proved both
-- validation scans can succeed. MATCH SIMPLE, so a NULL-owner consultancy row skips the lookup —
-- which is exactly why MV-159's header calls this chain "protection with a scheduled removal date"
-- and why re-creating it restores a weaker guarantee than it looks like. That is correct for a
-- rollback: it restores what was there, not what should have been.
alter table public.application_attempts
  add constraint application_attempts_prediction_id_owner_fkey
  foreign key (prediction_id, owner) references public.program_predictions (id, owner);
alter table public.outcome_events
  add constraint outcome_events_attempt_id_owner_fkey
  foreign key (attempt_id, owner) references public.application_attempts (id, owner);

-- The covering index for the second of those FKs. Non-unique, `(attempt_id, owner)`, exactly as
-- `20260620000000` created it — without it the Supabase performance advisor's
-- `unindexed_foreign_keys` fires, which is the finding `20260620010000` exists because of.
create index outcome_events_attempt_id_owner_idx on public.outcome_events (attempt_id, owner);

-- =====================================================================
-- 7  ALL SEVEN legacy owner-keyed uniqueness rules
-- =====================================================================
-- SEVEN, NOT SIX, AND THE DISCREPANCY IS IN THE SPEC RATHER THAN HERE. Spec §10.1 R1's prose lists
-- "the four legacy owner uniques … and the two from §9.4" — six. MV-160's drop list is SEVEN, because
-- §9.3 found `program_predictions_owner_assessment_id_program_id_rule_ver_key` present in the
-- database and absent from every list, and MV-160 (h) drops it. A rollback written from R1's prose
-- restores six of seven and leaves "one frozen prediction run per rule version"
-- (`20260620000000`:38) unenforced — silently, because nothing re-asserts it.
--
-- THREE ARE CONSTRAINTS AND FOUR ARE INDEXES, and the catalog distinction is not cosmetic: `alter
-- table … add constraint … unique` and `create unique index` are not interchangeable, a constraint
-- cannot carry a `where` predicate, and `pg_constraint` vs `pg_indexes` is what a catalogue diff
-- keys on. MV-160 (h) had to make the same distinction in the other direction.

-- 7a  the three UNIQUE CONSTRAINTS
alter table public.profiles
  add constraint profiles_owner_key unique (owner);
alter table public.documents
  add constraint documents_owner_kind_key unique (owner, kind);
-- 63 characters, which is the maximum an identifier can be: this is Postgres's own auto-name for
-- `unique (owner, assessment_id, program_id, rule_version)` after truncation, and it is stated
-- literally so the restored name is byte-identical to the dropped one rather than re-derived.
alter table public.program_predictions
  add constraint program_predictions_owner_assessment_id_program_id_rule_ver_key
  unique (owner, assessment_id, program_id, rule_version);

-- 7b  the two PARTIAL unique indexes — the predicate is the rule, not an optimisation
-- `assessments_primary_idx` is "at most one PRIMARY assessment per owner", not "one assessment per
-- owner"; `plan_items_kind_open_idx` is "at most one OPEN item per kind per owner". Drop either
-- `where` and the restored rule is a different, much stricter rule that real data violates
-- immediately. Verbatim from `20260603170655`:59 and `20260604024609`:18.
create unique index assessments_primary_idx
  on public.assessments (owner) where is_primary;
create unique index plan_items_kind_open_idx
  on public.plan_items (owner, kind) where status = 'todo';

-- 7c  the two FULL unique indexes — **NO `where owner is not null`, AND THIS IS THE 42P10 CANARY**
-- MV-156 shipped these FULL after measuring the alternative, and spec §10.1 R1 carries an explicit
-- 2026-08-03 amendment about it: R1 used to say only "the two from §9.4" while §9.4 quoted the
-- PARTIAL form, so an unwind written from that table would have re-created an index PostgREST's bare
-- `on_conflict=` cannot infer — **re-introducing, during a rollback, the exact defect MV-156
-- corrected on the way in.**
--
-- Concretely: `lib/documents/status-repo.ts:36` (`setObtained`, `onConflict: "owner,kind"`, driven by
-- `app/api/documents/status/route.ts` on the AUTHENTICATED client) and `lib/matches/repo.ts:28`
-- (`upsertProgramState`, `onConflict: "owner,program_id"`) name these indexes as `ON CONFLICT`
-- arbiters. Postgres infers a PARTIAL unique index as an arbiter only when the statement supplies the
-- index predicate; PostgREST emits a bare column list. Partial → **42P10 at runtime, on a live
-- request** — the live document checklist down, during the rollback, for every student.
--
-- The predicate was never load-bearing anyway: NULLs are distinct in a unique index, so the FULL form
-- already permits unlimited NULL-owner rows, which is the only behaviour the predicate would buy.
-- §8 asserts `indpred IS NULL` on both rather than trusting these two lines.
create unique index user_program_state_owner_program_idx
  on public.user_program_state (owner, program_id);
create unique index document_status_owner_kind_idx
  on public.document_status (owner, kind);

-- =====================================================================
-- 8  ASSERT THE RESTORED STATE — the last statements, so a failure aborts the whole unwind
-- =====================================================================
-- "The rollback ran" and "the rollback restored" are different claims. Everything above proves the
-- first. This block runs INSIDE the transaction and is the only thing that speaks to the second — and
-- it deliberately checks the four clause families from the header individually, because a policy
-- COUNT cannot see a predicate that came back one conjunct lighter, and that is the way this script
-- fails.
do $$
declare
  v_problems text[] := '{}';
  v_n        int;
  v_expr     text;
begin
  -- ---- (a) the tighten is undone -----------------------------------------------------------
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and column_name = 'case_id' and is_nullable = 'YES'
     and table_name in ('profiles','plan_items','user_program_state','documents','document_status',
                        'program_predictions','application_attempts','outcome_events');
  if v_n <> 8 then
    v_problems := v_problems || format('case_id is nullable on only %s of the eight', v_n);
  end if;
  if exists (select 1 from pg_constraint where conname = 'assessments_case_required_when_owned') then
    v_problems := v_problems || 'the assessments CHECK survived';
  end if;

  -- ---- (b) the compensating checks are back AND VALIDATED -----------------------------------
  -- `convalidated`, not merely present: a `NOT VALID` check does not constrain existing rows, so a
  -- restore that skipped the validate step leaves the disjunct decorative on exactly the rows it
  -- exists for.
  select count(*) into v_n from pg_constraint
   where contype = 'c' and convalidated and conname like '%\_ownership\_axis\_present';
  if v_n <> 8 then
    v_problems := v_problems || format('%s of 8 VALIDATED _ownership_axis_present checks', v_n);
  end if;

  -- ---- (c) the legacy owner chain: 3 targets + 2 FKs + 1 covering index ---------------------
  select count(*) into v_n from pg_constraint
   where conname in ('program_predictions_id_owner_key','application_attempts_id_owner_key',
                     'outcome_events_id_owner_key','application_attempts_prediction_id_owner_fkey',
                     'outcome_events_attempt_id_owner_fkey');
  if v_n <> 5 then
    v_problems := v_problems || format('legacy owner chain is %s of 5 objects', v_n);
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
                  and indexname = 'outcome_events_attempt_id_owner_idx') then
    v_problems := v_problems || 'outcome_events_attempt_id_owner_idx is missing (advisor: unindexed_foreign_keys)';
  end if;

  -- ---- (d) all SEVEN owner uniques, with the right catalog kind AND the right predicate -----
  select count(*) into v_n from pg_constraint
   where contype = 'u' and conname in ('profiles_owner_key','documents_owner_kind_key',
                     'program_predictions_owner_assessment_id_program_id_rule_ver_key');
  if v_n <> 3 then
    v_problems := v_problems || format('%s of 3 owner UNIQUE CONSTRAINTS restored', v_n);
  end if;

  -- The two PARTIAL ones must stay partial: full would be a stricter rule real data violates.
  select count(*) into v_n from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname in ('assessments_primary_idx','plan_items_kind_open_idx')
     and i.indisunique and i.indpred is not null;
  if v_n <> 2 then
    v_problems := v_problems || format('%s of 2 partial owner unique INDEXES restored WITH their predicate', v_n);
  end if;

  -- THE 42P10 CANARY. Both replacement uniques must exist and be FULL — `indpred IS NULL`. A partial
  -- one cannot be inferred by PostgREST's bare `on_conflict=` and takes the live document checklist
  -- down on the next request. This is the check that catches an unwind written from spec §9.4's
  -- pre-amendment prose.
  select count(*) into v_n from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname in ('user_program_state_owner_program_idx','document_status_owner_kind_idx')
     and i.indisunique and i.indpred is null;
  if v_n <> 2 then
    v_problems := v_problems || format('%s of 2 replacement uniques are FULL unique indexes (42P10 canary)', v_n);
  end if;

  -- ---- (e) the policy set: 24 case policies, RLS still forced ------------------------------
  select count(*) into v_n
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polname like '%\_case';
  if v_n <> 24 then
    v_problems := v_problems || format('%s of 24 case policies present', v_n);
  end if;

  -- 24 case-aware + the untouched service_role INSERT policy on documents.
  select count(*) into v_n
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('profiles','assessments','plan_items','user_program_state','documents',
                       'document_status','program_predictions','application_attempts','outcome_events');
  if v_n <> 25 then
    v_problems := v_problems || format('expected 25 policies on the nine, found %s', v_n);
  end if;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relforcerowsecurity
     and c.relname in ('profiles','assessments','plan_items','user_program_state','documents',
                       'document_status','program_predictions','application_attempts','outcome_events');
  if v_n <> 9 then
    v_problems := v_problems || format('RLS is enabled AND forced on only %s of the nine', v_n);
  end if;

  -- ---- (f) THE TRANSITIONAL DISJUNCT IS ACTUALLY BACK, IN BOTH SHAPES ----------------------
  -- The reason this script exists is that a pure case predicate over re-widened nullable rows hides a
  -- case-less row from its own owner, silently. A count of 24 policies does not say the disjunct came
  -- with them. `(select auth.uid())` renders as `( SELECT auth.uid() AS uid)`; the pattern is the one
  -- MV-159-rollback's closing block already relies on, so the rendering is established rather than
  -- guessed. Single-line patterns only — a multi-line LIKE would be voided by CRLF on this platform.
  select count(*) into v_n
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polname like '%\_case'
     and coalesce(pg_get_expr(p.polqual, p.polrelid), '')
         || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
         like '%owner = ( SELECT auth.uid() AS uid)%';
  if v_n <> 24 then
    v_problems := v_problems || format(
      'only %s of 24 case policies carry the transitional owner disjunct — the remainder are pure '
      'case predicates over a re-widened nullable column, i.e. rows invisible to their own owner', v_n);
  end if;

  -- The five INSERT predicates must carry the INSERT SHAPE of the disjunct (`and case_id is null`),
  -- not the read shape. The bare form admits a row into any case the actor names, which MV-159 round
  -- 2 measured; restoring the wrong shape here would re-open it under a rollback's name.
  select count(*) into v_n
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where p.polname in ('ups_insert_case','ds_insert_case','pp_insert_case','aa_insert_case','oe_insert_case')
     and pg_get_expr(p.polwithcheck, p.polrelid) like '%case_id IS NULL%';
  if v_n <> 5 then
    v_problems := v_problems || format(
      '%s of 5 INSERT policies carry the INSERT shape of the disjunct (`and case_id is null`)', v_n);
  end if;

  -- ---- (g) THE FOUR CLAUSE FAMILIES THAT MUST HAVE SURVIVED (header (a)-(d)) ---------------
  -- (a) the owner axis, on all five INSERT predicates.
  select count(*) into v_n
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where p.polname in ('ups_insert_case','ds_insert_case','pp_insert_case','aa_insert_case','oe_insert_case')
     and pg_get_expr(p.polwithcheck, p.polrelid) like '%case_student_id%';
  if v_n <> 5 then
    v_problems := v_problems || format(
      'only %s of 5 INSERT policies still bound the OWNER axis — a client may name ANOTHER USER as '
      'owner with case_id pointed at its own case, planting a row of record in the victim''s data and '
      'permanently breaking their checklist against the (owner, kind) index §7 just re-created', v_n);
  end if;

  -- (b) MV-161's parent-pointer axis, on the two predicates that carry one.
  select count(*) into v_n
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where p.polname in ('pp_insert_case','oe_insert_case')
     and pg_get_expr(p.polwithcheck, p.polrelid) like '%supersedes%';
  if v_n <> 2 then
    v_problems := v_problems || format(
      'only %s of 2 INSERT policies still bound the PARENT-POINTER axis — MV-161 is NOT being unwound '
      'here, and without it the victim''s /api/account/delete raises P0001 forever on a row they '
      'cannot see', v_n);
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'outcome_event_case_id') then
    v_problems := v_problems || 'private.outcome_event_case_id() is gone — MV-161''s helper must survive R1';
  end if;

  -- (c) outcome_events' two non-ownership integrity clauses.
  select pg_get_expr(p.polwithcheck, p.polrelid) into v_expr
    from pg_policy p where p.polname = 'oe_insert_case';
  if coalesce(v_expr, '') not like '%self_reported%' then
    v_problems := v_problems || 'oe_insert_case lost `source = ''self_reported''` — a client could self-certify an official_verified outcome';
  end if;
  if coalesce(v_expr, '') not like '%verified_by IS NULL%' then
    v_problems := v_problems || 'oe_insert_case lost `verified_by is null`';
  end if;

  -- (d) assessments' null guard — the one table where the null branch is genuinely reachable.
  if coalesce((select pg_get_expr(p.polqual, p.polrelid) from pg_policy p
                where p.polname = 'assessments_select_case'), '') not like '%case_id IS NOT NULL%' then
    v_problems := v_problems || 'assessments_select_case lost its `case_id is not null` guard';
  end if;

  -- ---- (h) the prediction immutability guard is NARROWED and still SECURITY INVOKER --------
  -- Narrowed: `to_jsonb(new)` appears only in MV-155 §D's body. INVOKER: `prosecdef = false`, which is
  -- what makes the guard raise for `service_role` too — a DEFINER version would evaluate as its owner
  -- and the `exists` against `public.cases` would silently start succeeding under BYPASSRLS.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'reject_prediction_update'
       and not p.prosecdef
       and p.prosrc like '%to_jsonb(new) - ''case_id''::text%'
  ) then
    v_problems := v_problems || 'private.reject_prediction_update() is not the narrowed SECURITY INVOKER body — a later MV-160 re-apply would abort on its own reconciliation sweep';
  end if;

  if array_length(v_problems, 1) > 0 then
    raise exception 'MV-160 rollback POST-CONDITIONS FAILED: %', array_to_string(v_problems, '; ');
  end if;

  raise notice 'MV-160 rollback verification: COMPLETE — case_id nullable on 8, 8 validated checks, '
    'legacy owner chain + 7 owner uniques restored, 24 case policies carrying the transitional '
    'disjunct, owner/pointer/integrity axes intact, prediction guard narrowed.';
end;
$$;

commit;

-- AFTER THIS COMMITS the database is in the post-MV-159 / post-MV-161 / pre-MV-160 state, which is
-- exactly the predecessor `supabase/rehearsal/MV-159-rollback.sql` names — its Guard 2 (`case_id`
-- still nullable on the eight, the four legacy owner uniques present) will now pass.
--
-- ------------------------------------------------------------------------------------------------
-- THE ONE FAIL-OPEN RESIDUE IN AN OTHERWISE FAIL-CLOSED UNWIND, and it is the FOURTH recurrence of
-- the same omission in this directory — MV-155, MV-156 and MV-159 each shipped a rollback that left
-- the migration-history row behind, and each wrote the step at its point of use afterwards. Written
-- here up front:
--
--     delete from supabase_migrations.schema_migrations where version = '20260805140000';
--
-- Run it IMMEDIATELY after this script commits, not later and not only when you intend to re-apply.
-- Without it the history says MV-160 is applied while the catalog says it is not, and the divergence
-- is silent in two ways that both bite: `npx supabase db push` sees the migration as already applied
-- and SILENTLY NO-OPS, and `supabase migration list` tells an operator the opposite of the truth at
-- exactly the moment they are deciding whether it is safe to proceed. It is a harmless no-op in a
-- rehearsal — that procedure applies through `psql` with the migration file moved aside, so no row
-- was ever written — which is precisely why the gap is easy to miss here and expensive to miss in
-- production.
--
-- ------------------------------------------------------------------------------------------------
-- WHAT STILL HAS TO HAPPEN BEFORE THIS FILE IS EVIDENCE RATHER THAN A HYPOTHESIS (MV-154's
-- reversibility doctrine, and `README.md`'s opening paragraph: "a written rollback that was never run
-- is a hypothesis"). None of it is a code change; all of it is a rehearsal that has not been run yet:
--
--   1. EXECUTE IT, both directions. `npx supabase db reset` (every migration, MV-160 included), run
--      this script, then re-apply MV-160 through `psql --single-transaction` and run it again. Roll
--      forward, roll back, roll forward again — a rollback tested in only one direction has not been
--      tested. The second forward apply must produce the same step (a) sweep report as the first.
--   2. CAPTURE THE CATALOGUE FINGERPRINT and add it to this file, per the header's closing note. The
--      baseline is a stack reset with `20260805140000_stage2_tighten_case_mandatory.sql` moved OUT of
--      `supabase/migrations/`. Measure it; do not retype one.
--   3. PROVE THE REFUSALS FIRE. Guard 3 is the one that matters and it is the one a clean local stack
--      cannot reach by accident: seed a second `owner`-bearing profile for one student under a second
--      case, run this script, and confirm it REFUSES naming `profiles_owner_key` — and that the
--      schema is INTACT afterwards, not half-unwound. Then remove the row and run it for real.
--   4. RUN THE INTEGRATION LANE against the rolled-back state. The MV-159-era suites are the ones
--      that describe this shape; a green lane here is what says the restored policies authorize the
--      same reads and writes they did before MV-160.
--   5. WRITE `README.md` §"Rolling MV-160 back in production", in MV-156's / MV-159's shape, carrying
--      the bookkeeping-row step above and the Guard 3 expiry. This file is deliberately not the only
--      place either lives; that was MV-159's recorded lesson.
