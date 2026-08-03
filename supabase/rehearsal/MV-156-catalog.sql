-- MV-156 — CATALOG capture: columns, constraints and indexes for the NINE student-owned tables —
-- the eight this card relaxes, PLUS `assessments`.
--
--   psql -tAX -v ON_ERROR_STOP=1 -f supabase/rehearsal/MV-156-catalog.sql
--
-- WIDENED TO NINE ON 2026-08-03, and the reason is an acceptance criterion this capture could not
-- support. MV-156's criteria say "`public.assessments` is untouched … a diff that alters it fails
-- this card", but the capture covered only the eight, so the rehearsal's catalog diff was silent
-- about the ninth table — it could not have gone red if the migration HAD altered `assessments`.
-- "The diff was empty" and "the criterion is proved" were different claims, which is precisely the
-- distinction this whole file exists to keep. `assessments` is now in every section below, so the
-- pre-apply vs post-apply diff proves the untouched claim directly instead of by omission.
-- (The rehearsal RECORDED on the card was run against the eight-table version; see the card's Done
-- evidence, which now says what that run does and does not establish.)
--
-- THIS IS THE SCRIPT THAT MAKES "THE ROLLBACK RESTORED THE SCHEMA" A CHECKABLE CLAIM RATHER THAN A
-- HOPEFUL ONE. Capture it BEFORE applying MV-156, then again after replaying
-- `MV-156-rollback.sql`, and `diff` the two: the diff MUST BE EMPTY.
--
-- "The rollback ran without error" and "the rollback restored the schema" are different claims, and
-- only the diff proves the second. The concrete thing it catches is the one a first draft of the
-- rollback got wrong: restoring the composite primary keys while leaving the surrogate `id` columns
-- behind. That unwind exits without error and leaves a THIRD schema shape — one that neither the
-- migration nor the rollback describes — and no amount of "did it raise?" checking would notice.
--
-- Column ORDINALS are deliberately included. Dropping and re-adding a column changes `attnum`, and
-- an attnum gap is exactly the kind of residue that a `select *` or a regenerated
-- `lib/supabase/types.ts` surfaces later as a mystery.

\echo '=== columns (the nine) ==='
select c.table_name || '|' || c.ordinal_position || '|' || c.column_name || '|' ||
       c.data_type || '|' || c.is_nullable || '|' || coalesce(c.column_default, '-')
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name in ('profiles','assessments','plan_items','user_program_state','documents','document_status',
                        'program_predictions','application_attempts','outcome_events')
 order by c.table_name, c.ordinal_position;

\echo '=== constraints (the nine) ==='
-- `contype` and `tgenabled` are `"char"`, not `text`: concatenating them directly raises
-- "operator is not unique: text || char". Cast explicitly.
select t.relname || '|' || c.contype::text || '|' || c.conname || '|' || pg_get_constraintdef(c.oid)
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
 where n.nspname = 'public'
   and t.relname in ('profiles','assessments','plan_items','user_program_state','documents','document_status',
                     'program_predictions','application_attempts','outcome_events')
 order by t.relname, c.conname;

\echo '=== indexes (the nine) ==='
select tablename || '|' || indexname || '|' || indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('profiles','assessments','plan_items','user_program_state','documents','document_status',
                     'program_predictions','application_attempts','outcome_events')
 order by tablename, indexname;

\echo '=== triggers (the nine) — MV-156 adds none, and must remove none ==='
select t.relname || '|' || tg.tgname || '|' || tg.tgenabled::text || '|' || pg_get_triggerdef(tg.oid)
  from pg_trigger tg
  join pg_class t on t.oid = tg.tgrelid
  join pg_namespace n on n.oid = t.relnamespace
 where n.nspname = 'public' and not tg.tgisinternal
   and t.relname in ('profiles','assessments','plan_items','user_program_state','documents','document_status',
                     'program_predictions','application_attempts','outcome_events')
 order by t.relname, tg.tgname;

\echo '=== authenticated column grants (the nine) — MV-156 changes NO grant ==='
-- MV-159 asserts the grant set is unchanged from MV-155's baseline. Captured here so this card can
-- prove it did not perturb it, in either direction, including through the two table rewrites.
select table_name || '|' || privilege_type || '|' || column_name
  from information_schema.column_privileges
 where table_schema = 'public' and grantee = 'authenticated'
   and table_name in ('profiles','assessments','plan_items','user_program_state','documents','document_status',
                      'program_predictions','application_attempts','outcome_events')
 order by table_name, privilege_type, column_name;

\echo '=== RLS policies (the nine) — MV-156 adds none, alters none, drops none ==='
select tablename || '|' || policyname || '|' || cmd || '|' || coalesce(array_to_string(roles, ','), '-') ||
       '|' || coalesce(qual, '-') || '|' || coalesce(with_check, '-')
  from pg_policies
 where schemaname = 'public'
   and tablename in ('profiles','assessments','plan_items','user_program_state','documents','document_status',
                     'program_predictions','application_attempts','outcome_events')
 order by tablename, policyname;
