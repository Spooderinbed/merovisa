-- MV-156 — ROLLBACK. This is a SCRIPT, not a migration: it is never applied by
-- `supabase db push` and it carries no entry in supabase_migrations.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/rehearsal/MV-156-rollback.sql
--
-- Order is spec §10.1 **R5**, which is authoritative
-- (docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md):
--   1  drop the two case-side composite FKs (prediction_id, case_id) / (attempt_id, case_id)
--   2  THEN the three unique (id, case_id) targets     ← reversed, Postgres refuses with 2BP01
--   3  then their covering indexes
--   4  drop all eight <table>_ownership_axis_present checks
--   5  restore the composite PRIMARY KEYs, drop the replacement uniques,
--      AND DROP THE TWO SURROGATE `id` COLUMNS this card added
--   6  alter column owner set not null on the eight
--
-- The whole script is ONE transaction. That is what makes the intra-script ordering safe rather
-- than merely tidy: spec §10.2's first property — "there is never an instant, mid-unwind, where a
-- row is unconstrained on both axes" — holds trivially, because no other session ever observes an
-- intermediate state.
--
-- ============================ ITS PREDECESSOR, AND ITS EXPIRY ============================
--
-- VALID PREDECESSOR STATE: **MV-156 applied and MV-160 not applied**, with no NULL-owner row and no
-- duplicate legacy pair. Running it against any other state either fails loudly or — the dangerous
-- case — succeeds and leaves an unenforced schema. Guards 0-3 below check exactly those four facts
-- rather than trusting the operator; every one of them is queryable, which is the whole reason this
-- script needs no `-v` flag (see below).
--
-- RECONCILED 2026-08-03 — this line used to read "MV-156 applied, MV-157 NOT yet merged", and then
-- claimed the guards check that state. THEY DO NOT, AND THEY CANNOT: whether MV-157 has merged is a
-- fact about the CODEBASE, and the paragraph below correctly says this script checks only facts about
-- the DATABASE. The two halves contradicted each other. The resolution is that **MV-157's merge is
-- not part of this script's predicate at all**, and here is why, so nobody re-adds it:
--   * MV-157 ships NO MIGRATION (spec §9.7, MV-157 §F). It touches no object this script drops,
--     restores or re-creates, so nothing here becomes invalid when it merges.
--   * What MV-157's merge DOES expire is R6 — MV-155's blanket personal-case delete, because after
--     MV-157 a live create-or-resolve path mints cases that a blanket delete would destroy. That
--     expiry is guarded where it lives: `MV-155-rollback.sql` refuses without an explicit
--     `-v mv157_merged`, and its non-destructive path needs the `personal_case_ids` array captured
--     at apply time. Running R5 → R6 after MV-157 is therefore still possible; it is R6 that changes
--     shape, not R5.
--   * Spec §10.1 lists R5's predecessor as "R4 done" — i.e. MV-157's *code* reverted — because that
--     table describes the full reverse sweep, not this file's runnable precondition. Reverting the
--     code is an operator step above this script, and the consequence of skipping it is stated
--     there: repositories that still write `case_id`-only rows will trip Guard 2 on the next attempt
--     rather than corrupt anything. Loud, not silent.
--
-- WHAT THIS SCRIPT DOES TO ITS PREDECESSOR'S ROLLBACK, STATED BECAUSE IT IS EASY TO MISS:
-- `supabase/rehearsal/MV-155-rollback.sql` EXPIRED THE MOMENT MV-156's MIGRATION APPLIED. Its own
-- Guard 0 detects exactly that and refuses, which is correct — MV-156's checks and case-side FKs
-- depend on `case_id`, so its `drop column case_id` raises 2BP01 and its personal-case delete
-- raises 23503 against ON DELETE RESTRICT. THIS SCRIPT IS WHAT MAKES MV-155's RUNNABLE AGAIN:
-- after it commits, the database is back in the post-MV-155 state that MV-155's rollback names as
-- its predecessor, and the two run in sequence as spec §10.1's R5 → R6.
--
-- THE HARD EXPIRY — and it belongs to the STAGE, not just to this script. Step 6 re-applies
-- `SET NOT NULL` to `owner`, which succeeds ONLY while no NULL-owner row exists. The first
-- consultancy row Stage 3 writes ends that, permanently: from that point the only way to run this
-- script is to DELETE CONSULTANCY DATA, and Stage 2 is effectively irreversible (spec §10.2's
-- second property; the recovery path becomes a restore from backup, which is a decision the
-- founder should make knowingly rather than discover). Guard 2 refuses with the count and the
-- table names instead of letting Postgres raise a bare 23502 that says nothing about why.
--
-- NO `-v` FLAG IS REQUIRED, AND THE DIFFERENCE FROM MV-155's SCRIPT IS PRINCIPLED RATHER THAN AN
-- INCONSISTENCY. MV-155's step 7 needed `-v mv157_merged` because its expiry — "has a live
-- create-or-resolve path shipped?" — is a fact about the CODEBASE that SQL genuinely cannot
-- observe, so refusing to guess was the only safe posture. Every expiry of THIS script is a fact
-- about the DATABASE: a NULL owner, a duplicate legacy pair, a missing constraint. All three are
-- queryable, so they are checked rather than declared.
-- =========================================================================================

\set ON_ERROR_STOP on

begin;

-- =====================================================================
-- Guard 0 — refuse if MV-156 is not actually applied
-- =====================================================================
-- So a mis-fired run is a no-op with a reason rather than a pile of "does not exist" errors that
-- an operator has to interpret under pressure.
do $$
declare
  v_checks int;
begin
  select count(*) into v_checks from pg_constraint where conname like '%\_ownership\_axis\_present';
  if v_checks = 0 then
    raise exception
      'MV-156 rollback REFUSED: MV-156 does not appear to be applied — no _ownership_axis_present '
      'check exists. Nothing to unwind. (If you are trying to unwind MV-155, use '
      'supabase/rehearsal/MV-155-rollback.sql.)';
  end if;
  if v_checks <> 8 then
    raise exception
      'MV-156 rollback REFUSED: expected 8 _ownership_axis_present checks, found %. The schema is '
      'in a state neither the migration nor this rollback describes; investigate before unwinding.',
      v_checks;
  end if;
end;
$$;

-- =====================================================================
-- Guard 1 — refuse if MV-160 has applied
-- =====================================================================
-- MV-160 sets `case_id NOT NULL` on the eight and drops all eight checks. If `case_id` is already
-- mandatory anywhere, this script is being run out of order: the correct unwind is the stage-level
-- reverse sweep starting at R1, not here.
do $$
declare
  v_tightened text;
begin
  select string_agg(table_name, ', ' order by table_name) into v_tightened
    from information_schema.columns
   where table_schema = 'public' and column_name = 'case_id' and is_nullable = 'NO'
     and table_name in ('profiles','plan_items','user_program_state','documents','document_status',
                        'program_predictions','application_attempts','outcome_events');
  if v_tightened is not null then
    raise exception
      'MV-156 rollback REFUSED: case_id is already NOT NULL on: %. MV-160 has applied, so this '
      'script is out of order — run the stage-level reverse sweep from R1 (Stage 2 matrix spec '
      '§10.1) instead.', v_tightened;
  end if;
end;
$$;

-- =====================================================================
-- Guard 2 — THE HARD EXPIRY: any NULL-owner row makes step 6 impossible
-- =====================================================================
-- Checked up front, across all eight at once, so the operator learns the FULL extent before
-- anything is dropped — rather than discovering it as a 23502 on the sixth table after five have
-- already been unwound inside a transaction they now have to abort.
do $$
declare
  v_offenders text;
begin
  select string_agg(t || ' (' || n::text || ')', ', ' order by t) into v_offenders from (
    select 'profiles' as t, count(*) as n from public.profiles where owner is null having count(*) > 0
    union all select 'plan_items', count(*) from public.plan_items where owner is null having count(*) > 0
    union all select 'user_program_state', count(*) from public.user_program_state where owner is null having count(*) > 0
    union all select 'documents', count(*) from public.documents where owner is null having count(*) > 0
    union all select 'document_status', count(*) from public.document_status where owner is null having count(*) > 0
    union all select 'program_predictions', count(*) from public.program_predictions where owner is null having count(*) > 0
    union all select 'application_attempts', count(*) from public.application_attempts where owner is null having count(*) > 0
    union all select 'outcome_events', count(*) from public.outcome_events where owner is null having count(*) > 0
  ) s;
  if v_offenders is not null then
    raise exception
      'MV-156 rollback REFUSED — THE STAGE 2 ROLLBACK WINDOW HAS CLOSED. NULL-owner rows exist: %. '
      'Step 6 (`alter column owner set not null`) would raise 23502, and the only way forward from '
      'here is DELETING CONSULTANCY DATA. That is a founder decision, not an operator one. See the '
      'Stage 2 matrix spec §10.2: from the first consultancy row, the recovery path is a restore '
      'from backup.', v_offenders;
  end if;
end;
$$;

-- =====================================================================
-- Guard 3 — restoring a composite PRIMARY KEY needs no duplicate legacy pairs
-- =====================================================================
-- The replacement uniques this card shipped are FULL, so a duplicate `(owner, program_id)` /
-- `(owner, kind)` for a NON-NULL owner is already impossible. Checked anyway: this script must be
-- correct against the state it MEETS, not against the state the migration intended to leave — and
-- a partial apply, a hand-edit, or a hotfix index drop all produce a state where step 5 would fail
-- halfway. Guard 2 has already established there are no NULL owners.
do $$
declare
  v_dupes text;
begin
  select string_agg(msg, '; ') into v_dupes from (
    select 'user_program_state has ' || count(*)::text || ' duplicate (owner, program_id) pairs' as msg
      from (select owner, program_id from public.user_program_state
             group by owner, program_id having count(*) > 1) d having count(*) > 0
    union all
    select 'document_status has ' || count(*)::text || ' duplicate (owner, kind) pairs'
      from (select owner, kind from public.document_status
             group by owner, kind having count(*) > 1) d having count(*) > 0
  ) s;
  if v_dupes is not null then
    raise exception
      'MV-156 rollback REFUSED: cannot restore the composite primary keys — %. Resolve the '
      'duplicates before unwinding.', v_dupes;
  end if;
end;
$$;

-- =====================================================================
-- 1  the two case-side composite FKs — FIRST
-- =====================================================================
-- Before their unique targets, always. Reversed, Postgres refuses the target drop with 2BP01
-- ("cannot drop ... because other objects depend on it") — the card's step (1)/(2) ordering.
alter table public.application_attempts drop constraint application_attempts_prediction_id_case_id_fkey;
alter table public.outcome_events       drop constraint outcome_events_attempt_id_case_id_fkey;

-- =====================================================================
-- 2  the three unique (id, case_id) targets
-- =====================================================================
alter table public.program_predictions  drop constraint program_predictions_id_case_id_key;
alter table public.application_attempts drop constraint application_attempts_id_case_id_key;
alter table public.outcome_events       drop constraint outcome_events_id_case_id_key;

-- =====================================================================
-- 3  their covering indexes
-- =====================================================================
drop index public.application_attempts_prediction_id_case_id_idx;
drop index public.outcome_events_attempt_id_case_id_idx;

-- =====================================================================
-- 4  all eight compensating checks
-- =====================================================================
-- Only now, with the case chain already gone and `owner` about to become NOT NULL again — spec
-- §10.2's first property. Dropping these while the case chain still stood would leave a window in
-- which the MATCH SIMPLE hole is open and nothing complains; it is the one step whose misordering
-- does not fail loudly.
alter table public.profiles             drop constraint profiles_ownership_axis_present;
alter table public.plan_items           drop constraint plan_items_ownership_axis_present;
alter table public.user_program_state   drop constraint user_program_state_ownership_axis_present;
alter table public.documents            drop constraint documents_ownership_axis_present;
alter table public.document_status      drop constraint document_status_ownership_axis_present;
alter table public.program_predictions  drop constraint program_predictions_ownership_axis_present;
alter table public.application_attempts drop constraint application_attempts_ownership_axis_present;
alter table public.outcome_events       drop constraint outcome_events_ownership_axis_present;

-- =====================================================================
-- 5  the two PRIMARY KEY replacements, undone COMPLETELY
-- =====================================================================
-- THE SURROGATE COLUMN DROP IS THE PART A FIRST DRAFT LEFT OUT, AND IT IS NOT COSMETIC. Restoring
-- the composite PK while leaving `user_program_state.id` and `document_status.id` behind does not
-- return the schema to its pre-MV-156 shape — it returns it to a THIRD shape that neither the
-- migration nor this rollback describes: `select *` gains a column, `lib/supabase/types.ts`
-- regenerates differently, an `insert … values (…)` without a column list breaks, and MV-160's
-- identity-parity comparison sees a column it cannot account for. A rollback that leaves residue
-- is a rollback nobody can verify by diffing the schema, which is the only way it IS verified.
--
-- `drop column id` takes the surrogate PRIMARY KEY constraint with it, so the table is momentarily
-- keyless — safe inside this transaction, and the composite PK is added back in the same statement
-- group. `add constraint … primary key` re-applies NOT NULL to its columns implicitly, which makes
-- step 6 a no-op for these two; step 6 still names them, because R5 does and because the guarantee
-- should not depend on a Postgres implicit.
drop index public.user_program_state_owner_program_idx;
alter table public.user_program_state drop column id;
alter table public.user_program_state add constraint user_program_state_pkey primary key (owner, program_id);

drop index public.document_status_owner_kind_idx;
alter table public.document_status drop column id;
alter table public.document_status add constraint document_status_pkey primary key (owner, kind);

-- =====================================================================
-- 6  owner NOT NULL on the eight
-- =====================================================================
-- Guard 2 has already proved this can succeed. It is stated per table anyway, in the same order
-- the forward migration relaxed them, so the two files read as mirrors.
alter table public.profiles             alter column owner set not null;
alter table public.plan_items           alter column owner set not null;
alter table public.user_program_state   alter column owner set not null;
alter table public.documents            alter column owner set not null;
alter table public.document_status      alter column owner set not null;
alter table public.program_predictions  alter column owner set not null;
alter table public.application_attempts alter column owner set not null;
alter table public.outcome_events       alter column owner set not null;

-- =====================================================================
-- POST-CONDITIONS — "the rollback ran" and "the rollback restored" are different claims
-- =====================================================================
-- Only this block proves the second. It runs INSIDE the transaction, so a failure aborts the whole
-- unwind rather than reporting a broken result after the fact.
do $$
declare
  v_problems text[];
begin
  -- (a) owner is NOT NULL on all eight again
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and column_name='owner' and is_nullable='YES'
       and table_name in ('profiles','plan_items','user_program_state','documents','document_status',
                          'program_predictions','application_attempts','outcome_events')
  ) then
    v_problems := v_problems || 'owner is still nullable on at least one of the eight';
  end if;

  -- (b) every MV-156 object is gone, BY NAME
  if exists (select 1 from pg_constraint where conname like '%\_ownership\_axis\_present') then
    v_problems := v_problems || 'an _ownership_axis_present check survived';
  end if;
  if exists (select 1 from pg_constraint
              where conname in ('program_predictions_id_case_id_key','application_attempts_id_case_id_key',
                                'outcome_events_id_case_id_key','application_attempts_prediction_id_case_id_fkey',
                                'outcome_events_attempt_id_case_id_fkey')) then
    v_problems := v_problems || 'a case-side unique or composite FK survived';
  end if;
  if exists (select 1 from pg_indexes where schemaname='public'
              and indexname in ('application_attempts_prediction_id_case_id_idx','outcome_events_attempt_id_case_id_idx',
                                'user_program_state_owner_program_idx','document_status_owner_kind_idx')) then
    v_problems := v_problems || 'an MV-156 index survived';
  end if;

  -- (c) THE SURROGATE COLUMNS ARE GONE — the assertion the corrected step 5 exists for
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and column_name='id'
       and table_name in ('user_program_state','document_status')
  ) then
    v_problems := v_problems || 'a surrogate id column survived — the schema is in a THIRD shape, not the pre-MV-156 one';
  end if;

  -- (d) the composite primary keys are back, in their exact original form
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid='public.user_program_state'::regclass and contype='p')
     is distinct from 'PRIMARY KEY (owner, program_id)' then
    v_problems := v_problems || 'user_program_state PK is not PRIMARY KEY (owner, program_id)';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid='public.document_status'::regclass and contype='p')
     is distinct from 'PRIMARY KEY (owner, kind)' then
    v_problems := v_problems || 'document_status PK is not PRIMARY KEY (owner, kind)';
  end if;

  -- (e) MV-155's state is intact and untouched — this script must land exactly on R6's predecessor
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='outcome_events' and column_name='case_id') then
    v_problems := v_problems || 'case_id is missing — this script must leave MV-155 fully applied';
  end if;
  if exists (select 1 from pg_constraint
              where conname in ('program_predictions_id_owner_key','application_attempts_id_owner_key',
                                'outcome_events_id_owner_key','application_attempts_prediction_id_owner_fkey',
                                'outcome_events_attempt_id_owner_fkey')
             having count(*) <> 5) then
    v_problems := v_problems || 'the legacy owner chain is not intact (expected all 5 objects)';
  end if;

  if array_length(v_problems, 1) > 0 then
    raise exception 'MV-156 rollback POST-CONDITIONS FAILED: %', array_to_string(v_problems, '; ');
  end if;

  raise notice 'MV-156 rollback verification: COMPLETE — schema restored to the post-MV-155 state.';
end;
$$;

commit;

-- AFTER THIS COMMITS, the database is in the post-MV-155 / pre-MV-156 state, which is exactly the
-- predecessor `supabase/rehearsal/MV-155-rollback.sql` requires. Its Guard 0 will now pass —
-- verified in the rehearsal, not assumed: after this script ran, MV-155's rollback refused only
-- for its MISSING `-v mv157_merged` flag, no longer for "MV-156 has applied".
--
-- ONE RESIDUE THIS SCRIPT CANNOT REMOVE, MEASURED IN THE REHEARSAL AND RECORDED RATHER THAN HIDDEN:
-- `drop column id` leaves a dropped-column attnum gap, so if MV-156 is later RE-APPLIED the
-- surrogate `id` comes back at the NEXT ordinal rather than its original one
-- (`user_program_state` 8 → 9, `document_status` 6 → 7). Nothing else differs: the forward/back/
-- forward sweep diffed to exactly those two lines, and the post-rollback catalog matched the
-- pre-MV-156 baseline EXACTLY — a dropped column leaves no `information_schema.columns` row, and
-- every surviving column keeps its original ordinal, which is what the card's "column for column"
-- assertion asks for.
--
-- It is harmless and it is not novel: `assessments` (1), `documents` (3), `user_program_state` (1)
-- and `document_status` (1) ALREADY carry dropped-column gaps from earlier migrations (spec §2.2
-- notes two of them). PostgREST, supabase-js and the generated types are all name-keyed, so only
-- bare `select *` column ORDER moves. Stated here so MV-160's identity-parity comparison keys on
-- column NAME rather than `ordinal_position` — a comparison written against ordinals would go red
-- on any database that had ever been rolled back and re-applied, for no real reason.
--
-- THE ONE FAIL-OPEN RESIDUE IN AN OTHERWISE FAIL-CLOSED UNWIND — STATED AS SUCH, 2026-08-03, RATHER
-- THAN AS A RE-APPLY FOOTNOTE. Everything above refuses rather than guesses: four guards before the
-- first drop, a post-condition block inside the transaction that aborts the whole unwind if the
-- schema is not exactly the post-MV-155 shape. **None of it touches the migration bookkeeping.** When
-- this script commits after a `supabase db push` apply, `supabase_migrations.schema_migrations` still
-- carries the row for `20260803120000` while the schema no longer carries MV-156 — the history says
-- applied, the catalog says not. That divergence is silent, and it has two distinct consequences:
--
--   1. `npx supabase db push` sees the migration as already applied and SILENTLY NO-OPS, so a
--      re-apply appears to succeed and changes nothing.
--   2. Anything that reads the history to decide what state the database is in — including a human
--      running `supabase migration list` before deciding whether it is safe to proceed — is told the
--      opposite of the truth.
--
-- The row is NOT deleted here on purpose: this file is a script, not a migration, it is run against
-- databases that never had the row (the rehearsal applies through psql with the migration file moved
-- aside, so there is nothing to delete), and a DELETE against another project's bookkeeping table is
-- not a thing a rollback should do without the operator knowing. So it is the operator's step, and it
-- is written at every point of use rather than only here — `supabase/rehearsal/README.md` §"Running
-- the MV-156 rehearsal" step 7 and §"Rolling MV-156 back in production" both carry it as a numbered
-- action, which is the discipline MV-155 established for its own manual apply-time step:
--
--     delete from supabase_migrations.schema_migrations where version = '20260803120000';
--
-- Run it IMMEDIATELY after this script commits, not later and not only when you intend to re-apply.
-- Leaving it is the same class of gap MV-155's rehearsal surfaced: a true statement about the schema
-- and a false one about the history, with nothing in the system that notices they disagree.
