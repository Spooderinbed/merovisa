-- MV-161 — ROLLBACK. This is a SCRIPT, not a migration: it is never applied by
-- `supabase db push` and it carries no entry in supabase_migrations.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/rehearsal/MV-161-rollback.sql
--
-- ============================ WHY THIS FILE EXISTS AT ALL ============================
--
-- Every other Stage 2 migration in this directory has a reverse script; MV-161 did not.
-- `MV-160-rollback.sql` says why in its own header, and it is right on its own terms:
--
--     "**MV-161 IS NOT BEING UNWOUND HERE.** It landed after spec §10.1's table was written and has
--      no row of its own; it is a P0 fix that sits ON TOP of MV-159 and must survive R1 untouched."
--
-- That is the correct behaviour for an INCIDENT unwind — R1 restores MV-159's shape while keeping a
-- live P0 fix, and its §8 post-conditions ASSERT the pointer bound survived. So after R1 the database
-- sits at **post-MV-159 / post-MV-161 / pre-MV-160**.
--
-- MV-165 needs a different endpoint. `obfvrxixtautamflzxzq` is applied through
-- `20260803180000_case_aware_student_data_rls` (MV-159) and has **both** `20260805120000` (MV-161)
-- and `20260805140000` (MV-160) pending. To rehearse the real production apply on real production
-- data, the rehearsal host has to start where production actually stands — **post-MV-159 /
-- pre-MV-161 / pre-MV-160** — and then roll forward through both files in their real order. R1 alone
-- lands one migration short of that, so this script closes the gap.
--
-- RUN IT AFTER `MV-160-rollback.sql`, NEVER BEFORE. Reverse order of application: MV-160 was applied
-- last, so it is unwound first. Guard 1 below checks that against the catalog rather than trusting
-- the operator — run in the wrong order it refuses, because MV-160's own re-created predicates carry
-- the pointer bound and stripping it out from under them would leave the database in a state neither
-- migration ever produced.
--
-- ============================ WHAT IT PUTS BACK, AND WHAT IT MUST NOT TOUCH ============================
--
-- MV-161 created THREE things and nothing else — no table, column, index, constraint or grant, and
-- no data was written:
--
--   1. `private.outcome_event_case_id(uuid)`  — the fourth parent-case helper.
--   2. one added conjunct on `pp_insert_case`  (`supersedes_prediction_id` …).
--   3. one added conjunct on `oe_insert_case`  (`supersedes_event_id` …).
--
-- So the reversal is: restore MV-159's two predicates VERBATIM, then drop the helper. The two
-- `create policy` bodies below are copied character-for-character out of
-- `supabase/migrations/20260803180000_case_aware_student_data_rls.sql` — including the
-- `-- MV-160 §D: delete this line` marker, which MV-160 §D still expects to find in that exact
-- position — with MV-161's trailing conjunct removed and NOTHING else changed.
--
-- THE THREE CLAUSE FAMILIES THAT MUST SURVIVE THIS SCRIPT are the same ones `MV-160-rollback.sql`
-- §8 (a)/(c) protects, and for the same reasons. This file re-types both predicates in full, so it
-- is exactly the kind of edit that drops one by accident:
--
--   (a) THE OWNER-AXIS BOUND — `owner is null or owner = private.case_student_id(case_id)`.
--       Without it, `owner = <a victim>, case_id = <the actor's own case>` is ADMITTED: a fabricated
--       `visa_granted` outcome event of record in the victim's data. No legitimate caller notices,
--       because every live writer derives `owner` from `cases.student_user_id`.
--   (c) `oe_insert_case`'s `source = 'self_reported'` and `verified_by is null` (spec §4.9) — the
--       difference between "the student says they were granted a visa" and "the record says a
--       decision authority did".
--   (+) the transitional owner disjunct's INSERT shape (`and case_id is null`). The bare form admits
--       a row into any case the actor names — MV-159 round 2 measured it.
--
-- §4 asserts all of them by measurement rather than trusting this comment (§3 is the helper drop).
--
-- ============================ THE HOLE THIS RE-OPENS, STATED PLAINLY ============================
--
-- Between this script and the re-apply of `20260805120000`, the parent-pointer hole MV-161 closed is
-- OPEN: any signed-in user can plant `supersedes_prediction_id = <victim's prediction>` in their own
-- case, and the victim's `/api/account/delete` then raises `P0001` forever on a row they cannot see.
--
-- THAT IS ACCEPTABLE HERE AND ONLY HERE. This script's sole sanctioned use is on an OFFLINE
-- REHEARSAL HOST with no untrusted clients — the same host the MV-164 capture guard confines the
-- §A2 replay to. It is NOT an incident tool: during an incident use `MV-160-rollback.sql`, which
-- deliberately keeps the fix. There is no production scenario in which unwinding a live P0 fix is
-- the right move, which is why this file is in `rehearsal/` and says so twice.
--
-- One transaction, for `MV-159-rollback.sql`'s recorded reason: every `drop policy` + `create policy`
-- pair leaves a table momentarily with fewer policies than it needs, and RLS is ENABLED AND FORCED on
-- all nine — a table with RLS forced and zero matching policies returns ZERO ROWS to every client.
-- Inside one transaction no other session ever observes that gap.
--
-- No `lock_timeout`, deliberately, and for `MV-160-rollback.sql`'s reason: an unwind that fails
-- part-way is worse than an unwind that waits for the lock.

-- `MV-160-rollback.sql:145`'s line, and it is load-bearing rather than decorative. Both guards below
-- work by `raise exception`. WITHOUT this, a psql invoked without `-v ON_ERROR_STOP=1` does not stop:
-- it continues past the refusal, every following statement fails `25P02`, and the closing `commit;`
-- is executed inside an aborted transaction — which Postgres turns into a ROLLBACK and reports as
-- `ROLLBACK`, exit code 0. A REFUSAL WOULD THEN READ AS SUCCESS to any harness checking the exit
-- code. Setting it in the file means the guards cannot be defeated by the way the file is invoked.
\set ON_ERROR_STOP on

begin;

-- =====================================================================
-- 0  GUARD — MV-161 is actually applied
-- =====================================================================
-- Refuse a no-op that reads as a success. If the helper is already gone this script has either
-- already run or MV-161 never landed, and either way re-typing the two predicates would be writing
-- MV-159's shape over a state nobody verified.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'outcome_event_case_id'
  ) then
    raise exception
      'MV-161 rollback: private.outcome_event_case_id() does not exist, so MV-161 is not applied. '
      'This script has nothing to unwind and refuses rather than re-typing MV-159''s predicates over '
      'an unverified state.';
  end if;
end;
$$;

-- =====================================================================
-- 1  GUARD — MV-160 has already been unwound (reverse order of application)
-- =====================================================================
-- MV-160 tightens `case_id` to NOT NULL on eight tables and re-creates both predicates below. Run
-- against a post-MV-160 database this script would strip MV-161's conjunct out of MV-160's policies
-- and leave a shape neither migration ever produced — and it would leave `case_id` NOT NULL while
-- claiming the database is at MV-159. `case_id` nullable on `program_predictions` is the cheapest
-- true witness of "MV-160 is not applied", and it is the same witness `MV-159-rollback.sql` Guard 2
-- uses.
do $$
declare
  v_notnull boolean;
begin
  select a.attnotnull into v_notnull
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'program_predictions' and a.attname = 'case_id';

  if v_notnull is null then
    raise exception 'MV-161 rollback: public.program_predictions.case_id not found — this is not a Stage 2 database.';
  end if;

  if v_notnull then
    raise exception
      'MV-161 rollback: public.program_predictions.case_id is NOT NULL, so MV-160 (20260805140000) is '
      'still applied. Unwind in REVERSE ORDER OF APPLICATION: run supabase/rehearsal/MV-160-rollback.sql '
      'FIRST, then this script.';
  end if;
end;
$$;

-- =====================================================================
-- 2  restore MV-159's two INSERT predicates, VERBATIM
-- =====================================================================
-- Both bodies are copied character-for-character from
-- `supabase/migrations/20260803180000_case_aware_student_data_rls.sql` §9 and §11, minus MV-161's
-- trailing conjunct. `drop` + `create` rather than `create or replace policy`: MV-159 §2's idiom,
-- and it keeps this file re-runnable in the same way its siblings are.

-- MV-159 §9 — spec §4.7.
drop policy if exists pp_insert_case on public.program_predictions;

create policy pp_insert_case on public.program_predictions
  for insert to authenticated
  with check (
    (
      (owner = (select auth.uid()) and case_id is null)                         -- MV-160 §D: delete this line
      or (
        case_id is not null
        and case_id = any ((select private.actor_case_ids())::uuid[])
        and (owner is null or owner = private.case_student_id(case_id))
      )
    )
    and private.assessment_case_id(assessment_id) = case_id
  );

-- MV-159 §11 — spec §4.9. `source` and `verified_by` are NOT ownership clauses and are restored
-- with the rest of the predicate; dropping either while "unwinding MV-161" would be a trust
-- regression wearing a rollback's clothes.
drop policy if exists oe_insert_case on public.outcome_events;

create policy oe_insert_case on public.outcome_events
  for insert to authenticated
  with check (
    (
      (owner = (select auth.uid()) and case_id is null)                         -- MV-160 §D: delete this line
      or (
        case_id is not null
        and case_id = any ((select private.actor_case_ids())::uuid[])
        and (owner is null or owner = private.case_student_id(case_id))
      )
    )
    and private.attempt_case_id(attempt_id) = case_id
    and source = 'self_reported'
    and verified_by is null
  );

-- =====================================================================
-- 3  drop MV-161's helper
-- =====================================================================
-- Last, not first: §2's predicates stop referencing it, so the drop needs no CASCADE. A plain `drop
-- function` here is a load-bearing assertion — if any object still depends on the helper this
-- statement raises `2BP01` and the whole transaction aborts, which is the correct outcome. NEVER add
-- CASCADE: it would silently delete whatever that dependent was.
drop function private.outcome_event_case_id(uuid);

-- =====================================================================
-- 4  POST-CONDITIONS — the restored state is MEASURED, not assumed
-- =====================================================================
-- Collected into one list and raised together, so an operator sees every problem at once rather
-- than fixing them one abort at a time. `MV-160-rollback.sql` §8's shape.
do $$
declare
  v_problems text[] := '{}';
  v_expr     text;
  v_n        int;
begin
  -- (a) MV-161's artifacts are gone — the two conjuncts and the helper.
  select count(*) into v_n
    from pg_catalog.pg_policy p
   where p.polname in ('pp_insert_case', 'oe_insert_case')
     and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%supersedes%';
  if v_n <> 0 then
    v_problems := v_problems || format('%s of 2 INSERT predicates still carry MV-161''s pointer conjunct', v_n);
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'outcome_event_case_id'
  ) then
    v_problems := v_problems || 'private.outcome_event_case_id() still exists';
  end if;

  -- (b) both policies still EXIST. The removal must be a re-creation, never a deletion — a dropped
  --     INSERT policy on an RLS-FORCED table refuses every legitimate write instead of admitting a
  --     bad one, which is a silent outage rather than a hole, and is exactly as wrong.
  select count(*) into v_n
    from pg_catalog.pg_policy p
   where p.polname in ('pp_insert_case', 'oe_insert_case');
  if v_n <> 2 then
    v_problems := v_problems || format('%s of 2 INSERT policies exist — this script may only RE-CREATE them', v_n);
  end if;

  -- (c) the OWNER axis survived the re-typing (MV-159 round 3).
  select count(*) into v_n
    from pg_catalog.pg_policy p
   where p.polname in ('pp_insert_case', 'oe_insert_case')
     and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%case_student_id%';
  if v_n <> 2 then
    v_problems := v_problems || format(
      'only %s of 2 INSERT predicates still bound the OWNER axis — a client may name ANOTHER USER as '
      'owner with case_id pointed at its own case, planting a row of record in the victim''s data', v_n);
  end if;

  -- (d) the transitional disjunct is back in its INSERT shape, not the read shape. The bare form
  --     admits a row into any case the actor names (MV-159 round 2).
  select count(*) into v_n
    from pg_catalog.pg_policy p
   where p.polname in ('pp_insert_case', 'oe_insert_case')
     and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%case_id IS NULL%';
  if v_n <> 2 then
    v_problems := v_problems || format(
      '%s of 2 INSERT predicates carry the INSERT shape of the transitional disjunct (`and case_id is null`)', v_n);
  end if;

  -- (d2) THE CASE AXIS ITSELF. Checks (c) and (d) cover the OWNER arm and the transitional arm, and
  --      between them they would both pass on a predicate that had lost
  --      `case_id = any (private.actor_case_ids())` — the clause that decides WHICH CASE a row may
  --      be inserted into at all. Without it the case arm degenerates to "any non-null case_id whose
  --      student matches the owner", i.e. a client may insert into a case it has no access to. This
  --      script re-types both predicates in full, so that clause is exactly as droppable as the ones
  --      already guarded, and nothing else in this block would notice.
  select count(*) into v_n
    from pg_catalog.pg_policy p
   where p.polname in ('pp_insert_case', 'oe_insert_case')
     and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%actor_case_ids%';
  if v_n <> 2 then
    v_problems := v_problems || format(
      'only %s of 2 INSERT predicates still bound the CASE axis with private.actor_case_ids() — a '
      'client could name a case it has no access to', v_n);
  end if;

  -- (e) the parentage clauses survived.
  if coalesce((select pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
                 from pg_catalog.pg_policy p where p.polname = 'pp_insert_case'), '')
     not like '%assessment_case_id%' then
    v_problems := v_problems || 'pp_insert_case lost `private.assessment_case_id(assessment_id) = case_id`';
  end if;

  select pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) into v_expr
    from pg_catalog.pg_policy p where p.polname = 'oe_insert_case';
  if coalesce(v_expr, '') not like '%attempt_case_id%' then
    v_problems := v_problems || 'oe_insert_case lost `private.attempt_case_id(attempt_id) = case_id`';
  end if;

  -- (f) spec §4.9's two non-ownership integrity clauses.
  if coalesce(v_expr, '') not like '%self_reported%' then
    v_problems := v_problems || 'oe_insert_case lost `source = ''self_reported''` — a client could self-certify an official_verified outcome';
  end if;
  if coalesce(v_expr, '') not like '%verified_by IS NULL%' then
    v_problems := v_problems || 'oe_insert_case lost `verified_by is null`';
  end if;

  -- (g) MV-159's OTHER three parent-case helpers are untouched. This script drops one function by
  --     name; a fat-fingered drop of a sibling would not be caught by anything above, and MV-160's
  --     re-created predicates call all of them.
  select count(*) into v_n
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('actor_case_ids', 'assessment_case_id', 'prediction_case_id',
                       'attempt_case_id', 'case_student_id');
  if v_n <> 5 then
    v_problems := v_problems || format(
      'expected MV-159''s five private helpers to survive, found %s — MV-160''s re-created policies call all of them', v_n);
  end if;

  if array_length(v_problems, 1) > 0 then
    raise exception 'MV-161 rollback POST-CONDITIONS FAILED: %', array_to_string(v_problems, '; ');
  end if;

  raise notice 'MV-161 rollback verification: COMPLETE — pointer conjunct removed from both INSERT '
    'predicates, helper dropped, owner/parentage/integrity axes and the transitional disjunct intact, '
    'MV-159''s five helpers present. Database is at post-MV-159 / pre-MV-161 / pre-MV-160.';
end;
$$;

commit;

-- AFTER THIS COMMITS the database is in the **post-MV-159 / pre-MV-161 / pre-MV-160** state — which
-- is exactly where `obfvrxixtautamflzxzq` stands today.
--
-- ------------------------------------------------------------------------------------------------
-- THE SAME FAIL-OPEN RESIDUE ITS FOUR PREDECESSORS ALL SHIPPED — the migration-history row. Written
-- here up front rather than at the point of use:
--
--     delete from supabase_migrations.schema_migrations where version = '20260805120000';
--
-- Run it IMMEDIATELY after this script commits. Without it the history says MV-161 is applied while
-- the catalog says it is not, and `npx supabase db push` then SILENTLY NO-OPS on the re-apply —
-- which in a rehearsal means the "forward run" never actually runs the migration under test, and the
-- equivalence proof comes back green having proved nothing. `MV-160-rollback.sql`'s closing note
-- makes the same point about `20260805140000`; both rows have to go.
