-- MV-155 — ROLLBACK. This is a SCRIPT, not a migration: it is never applied by
-- `supabase db push` and it carries no entry in supabase_migrations.
--
--   psql -v ON_ERROR_STOP=1 -v mv157_merged=no -f supabase/rehearsal/MV-155-rollback.sql
--
-- Order is spec §10.1 **R6**, which is authoritative
-- (docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md):
--   1  restore the UNCONDITIONAL private.reject_prediction_update() body — FIRST
--   2  drop column case_id ×9 (takes the FKs and every MV-155 case index with it)
--   3  drop the UPSERT-seam triggers and their definer function
--   4  restore the flat table-level UPDATE / INSERT grants
--   5  drop private.mv155_backfill_personal_cases() / private.mv155_assert_case_backfill()
--   6  drop cases_personal_student_idx
--   7  delete the personal cases  ← GATED, see below
--
-- The whole script is ONE transaction, which is what makes the intra-script ordering safe rather
-- than merely tidy: there is no instant, visible to any other session, in which predictions are
-- updatable, or in which a trigger reads a column that no longer exists.
--
-- ============================ WHEN THIS SCRIPT STOPS BEING VALID ============================
--
-- THIS SLICE ROLLBACK IS VALID ONLY AGAINST ITS IMMEDIATE PREDECESSOR STATE, AND IT STOPS BEING
-- RUNNABLE THE MOMENT MV-156 LANDS. MV-156's `<table>_ownership_axis_present` checks and its
-- case-side composite FKs depend on `case_id`, so `drop column case_id` is refused with 2BP01, and
-- the personal-case delete then fails on ON DELETE RESTRICT. After that point the only correct
-- unwind is the STAGE-LEVEL reverse sweep R1→R6 in spec §10.1 — not this script. Guard 0 below
-- refuses rather than letting the script half-run.
--
-- STEP 7's EXPIRY IS DIFFERENT AND IT IS NOT DETECTABLE FROM THE DATABASE. Until MV-157 merges,
-- every `organization_id is null` case with a student link was minted by this migration, so a
-- blanket delete is exact. After MV-157 ships a live create-or-resolve path at signup/claim, that
-- same delete would destroy cases created by REAL SIGNUPS — irreversible data loss, with nothing
-- in the schema to distinguish the two populations. SQL cannot answer "has MV-157 merged", so the
-- script refuses to guess: it requires `-v mv157_merged=no`, or an explicit `-v personal_case_ids`
-- list of the ids this migration actually created.
--
-- WHERE THAT ID LIST COMES FROM — it is produced, not reconstructed. The forward migration's
-- `raise notice 'MV-155 backfill report: %'` carries a `personal_case_ids` key holding a jsonb array
-- of exactly the ids that apply minted:
--
--     {"cases_created": 9, "personal_case_ids": ["…","…"], "profiles": 7, …}
--
-- `supabase/rehearsal/README.md` §"Applying MV-155 to production" step 4 makes capturing that notice
-- a numbered step of the apply, precisely so this path is usable rather than nominal. Pass them
-- comma-separated and unquoted:
--
--     -v personal_case_ids="7b1f…,9c02…,…"
--
-- THERE IS NO RECOVERY IF THE NOTICE WAS NOT KEPT. `created_by`, `student_user_id`,
-- `operational_status` and `organization_id` all take values a real MV-157 signup also takes, and
-- these rows are inserted directly rather than through `private.write_audit_event`, so there is no
-- audit trail to mine either. Losing the notice does not merely make this path inconvenient; it
-- removes it. (An earlier draft described the list as "captured from the rehearsal's forward log"
-- when the log carried only counts — the list did not exist at all.)
-- ===========================================================================================

\set ON_ERROR_STOP on

\if :{?mv157_merged}
\else
  \warn 'MV-155 rollback REFUSED: pass -v mv157_merged=no  (or -v mv157_merged=yes together with'
  \warn '-v personal_case_ids="uuid,uuid,…" naming the cases THIS migration created). Step 7 is a'
  \warn 'blanket delete of every personal case and is only exact before MV-157 ships create-or-resolve.'
  \quit
\endif

begin;

-- =====================================================================
-- Guard 0 — MV-156 expiry, checked rather than trusted
-- =====================================================================
-- Two independent detectors, because either one alone can be defeated by a partial apply:
-- MV-156's headline change is `owner` nullable on the eight, and its compensating constraint is
-- `<table>_ownership_axis_present`. Spec §9.5 records the exact name; a script hunting the
-- REJECTED `check (case_id is not null)` name would find nothing and run on regardless.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and column_name = 'owner' and is_nullable = 'YES'
       and table_name in ('profiles','plan_items','user_program_state','documents','document_status',
                          'program_predictions','application_attempts','outcome_events')
  ) or exists (
    select 1 from pg_constraint where conname like '%\_ownership\_axis\_present'
  ) then
    raise exception
      'MV-155 rollback REFUSED: MV-156 has applied (owner is nullable, and/or an _ownership_axis_present check exists). '
      'This slice rollback expired when MV-156 landed — `drop column case_id` will raise 2BP01 and the personal-case '
      'delete will raise 23503. Use the stage-level reverse sweep R1..R6 in the Stage 2 matrix spec §10.1 instead.';
  end if;
end;
$$;

-- Guard 1 — refuse if MV-155 is not actually applied, so a mis-fired run is a no-op with a reason
-- rather than a pile of "does not exist" errors.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'case_id'
  ) then
    raise exception 'MV-155 rollback REFUSED: profiles.case_id does not exist — MV-155 is not applied.';
  end if;
end;
$$;

-- =====================================================================
-- 1  restore the unconditional immutability guard — BEFORE the column goes
-- =====================================================================
-- Verbatim from 20260620000000_add_outcome_validation.sql. SECURITY INVOKER (by omission) so
-- service_role does not bypass it, and `set search_path = ''` restated because `create or replace`
-- does not inherit the previous definition's configuration.
create or replace function private.reject_prediction_update()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'program_predictions is immutable (no UPDATE permitted)';
end;
$$;

-- =====================================================================
-- 2  drop case_id ×9 — takes the FKs and every MV-155 case index with it
-- =====================================================================
alter table public.profiles             drop column case_id;
alter table public.assessments          drop column case_id;
alter table public.plan_items           drop column case_id;
alter table public.user_program_state   drop column case_id;
alter table public.documents            drop column case_id;
alter table public.document_status      drop column case_id;
alter table public.program_predictions  drop column case_id;
alter table public.application_attempts drop column case_id;
alter table public.outcome_events       drop column case_id;

-- =====================================================================
-- 3  drop the UPSERT-seam triggers and their definer function
-- =====================================================================
-- An earlier draft of this list omitted this step, which would have left a SECURITY DEFINER trigger
-- deriving `case_id` from `owner` on two tables that no longer have a `case_id` column — every
-- shortlist write and every checklist toggle failing with `record "new" has no field "case_id"`.
drop trigger if exists user_program_state_derive_case_id on public.user_program_state;
drop trigger if exists document_status_derive_case_id    on public.document_status;
drop function if exists private.mv155_derive_case_id_from_owner();

-- =====================================================================
-- 4  restore the flat table-level UPDATE / INSERT grants
-- =====================================================================
-- SEVEN tables, not six. The card's §G text says "the six tables §H rewrote" while §H itself names
-- profiles + plan_items (UPDATE) and user_program_state + document_status + program_predictions +
-- application_attempts + outcome_events (INSERT) — seven distinct tables. Restoring six would leave
-- one holding a column list that names a column this script has just dropped.
--
-- `revoke <verb> on <table>` clears the column-level grants as well as the table-level one, so each
-- pair below is "clear whatever MV-155 left, then re-assert the pre-MV-155 flat grant".
revoke update on public.profiles              from authenticated;
grant  update on public.profiles                to authenticated;

revoke update on public.plan_items            from authenticated;
grant  update on public.plan_items              to authenticated;

revoke insert, update on public.user_program_state from authenticated;
grant  insert, update on public.user_program_state   to authenticated;

revoke insert, update on public.document_status from authenticated;
grant  insert, update on public.document_status   to authenticated;

revoke insert on public.program_predictions   from authenticated;
grant  insert on public.program_predictions     to authenticated;

revoke insert on public.application_attempts  from authenticated;
grant  insert on public.application_attempts    to authenticated;

revoke insert on public.outcome_events        from authenticated;
grant  insert on public.outcome_events          to authenticated;

-- =====================================================================
-- 5  drop the backfill and reconciliation functions
-- =====================================================================
drop function if exists private.mv155_backfill_personal_cases();
drop function if exists private.mv155_assert_case_backfill();

-- =====================================================================
-- 6  drop the personal-case uniqueness index
-- =====================================================================
drop index if exists public.cases_personal_student_idx;

-- =====================================================================
-- 7  delete the personal cases — the step with the expiry
-- =====================================================================
-- THIS DELETE CASCADES, and the two children are not `case_id`-on-the-nine (those are ON DELETE
-- RESTRICT and step 2 has already removed the column). `case_assignments.case_id` and
-- `invitations.case_id` are both **ON DELETE CASCADE** onto `public.cases`, so any row either table
-- holds for a personal case goes with it, silently and without appearing in the post-conditions
-- below. For MV-155-minted personal cases both are empty by construction — the migration creates
-- cases and nothing else, and neither table has a Stage 2 writer — which is why this is a note
-- rather than a guard. It stops being merely a note the moment anything assigns a counsellor to a
-- personal case or invites against one; at that point this step is destroying Stage 1 tenancy rows
-- as well as the case.
\if :{?personal_case_ids}
  \echo '-- step 7: deleting the RECORDED id list only'
  delete from public.cases
   where organization_id is null
     and student_user_id is not null
     and id = any (string_to_array(:'personal_case_ids', ',')::uuid[]);
\else
  \if :mv157_merged
    \warn 'MV-155 rollback ABORTED at step 7: mv157_merged is truthy but no -v personal_case_ids was given.'
    \warn 'A blanket delete would destroy cases created by real signups. Supply the recorded id list.'
    rollback;
    \quit
  \endif
  \echo '-- step 7: blanket delete (valid only before MV-157 merges)'
  delete from public.cases
   where organization_id is null
     and student_user_id is not null;
\endif

-- =====================================================================
-- Post-conditions — assert the unwind rather than assume it
-- =====================================================================
do $$
declare
  v_case_id_cols int;
  v_mv155_fns    int;
  v_triggers     int;
  v_col_grants   int;
begin
  select count(*) into v_case_id_cols from information_schema.columns
   where table_schema = 'public' and column_name = 'case_id'
     and table_name in ('profiles','assessments','plan_items','user_program_state','documents',
                        'document_status','program_predictions','application_attempts','outcome_events');
  select count(*) into v_mv155_fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname like 'mv155\_%';
  select count(*) into v_triggers from pg_trigger
   where not tgisinternal and tgname in ('user_program_state_derive_case_id','document_status_derive_case_id');
  -- A column-level grant surviving here means step 4 missed a table.
  select count(*) into v_col_grants from information_schema.column_privileges cp
   where cp.table_schema = 'public' and cp.grantee = 'authenticated' and cp.privilege_type in ('INSERT','UPDATE')
     and cp.table_name in ('profiles','plan_items','user_program_state','document_status',
                           'program_predictions','application_attempts','outcome_events')
     and not exists (
       select 1 from information_schema.role_table_grants rtg
        where rtg.table_schema = 'public' and rtg.grantee = 'authenticated'
          and rtg.table_name = cp.table_name and rtg.privilege_type = cp.privilege_type
     );

  if v_case_id_cols <> 0 or v_mv155_fns <> 0 or v_triggers <> 0 or v_col_grants <> 0 then
    raise exception 'MV-155 rollback INCOMPLETE: case_id cols=%, mv155 functions=%, seam triggers=%, orphan column grants=%',
      v_case_id_cols, v_mv155_fns, v_triggers, v_col_grants;
  end if;
  raise notice 'MV-155 rollback complete: case_id dropped on 9, seam triggers and mv155_* functions gone, flat grants restored.';
end;
$$;

commit;
