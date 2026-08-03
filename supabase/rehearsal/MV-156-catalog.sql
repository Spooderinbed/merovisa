-- MV-156 — CATALOG capture: columns, constraints and indexes for the eight relaxed tables.
--
--   psql -tAX -v ON_ERROR_STOP=1 -f supabase/rehearsal/MV-156-catalog.sql
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

\echo '=== columns (the eight) ==='
select c.table_name || '|' || c.ordinal_position || '|' || c.column_name || '|' ||
       c.data_type || '|' || c.is_nullable || '|' || coalesce(c.column_default, '-')
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name in ('profiles','plan_items','user_program_state','documents','document_status',
                        'program_predictions','application_attempts','outcome_events')
 order by c.table_name, c.ordinal_position;

\echo '=== constraints (the eight) ==='
-- `contype` and `tgenabled` are `"char"`, not `text`: concatenating them directly raises
-- "operator is not unique: text || char". Cast explicitly.
select t.relname || '|' || c.contype::text || '|' || c.conname || '|' || pg_get_constraintdef(c.oid)
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
 where n.nspname = 'public'
   and t.relname in ('profiles','plan_items','user_program_state','documents','document_status',
                     'program_predictions','application_attempts','outcome_events')
 order by t.relname, c.conname;

\echo '=== indexes (the eight) ==='
select tablename || '|' || indexname || '|' || indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('profiles','plan_items','user_program_state','documents','document_status',
                     'program_predictions','application_attempts','outcome_events')
 order by tablename, indexname;

\echo '=== triggers (the eight) — MV-156 adds none, and must remove none ==='
select t.relname || '|' || tg.tgname || '|' || tg.tgenabled::text || '|' || pg_get_triggerdef(tg.oid)
  from pg_trigger tg
  join pg_class t on t.oid = tg.tgrelid
  join pg_namespace n on n.oid = t.relnamespace
 where n.nspname = 'public' and not tg.tgisinternal
   and t.relname in ('profiles','plan_items','user_program_state','documents','document_status',
                     'program_predictions','application_attempts','outcome_events')
 order by t.relname, tg.tgname;

\echo '=== authenticated column grants (the eight) — MV-156 changes NO grant ==='
-- MV-159 asserts the grant set is unchanged from MV-155's baseline. Captured here so this card can
-- prove it did not perturb it, in either direction, including through the two table rewrites.
select table_name || '|' || privilege_type || '|' || column_name
  from information_schema.column_privileges
 where table_schema = 'public' and grantee = 'authenticated'
   and table_name in ('profiles','plan_items','user_program_state','documents','document_status',
                      'program_predictions','application_attempts','outcome_events')
 order by table_name, privilege_type, column_name;

\echo '=== RLS policies (the eight) — MV-156 adds none, alters none, drops none ==='
select tablename || '|' || policyname || '|' || cmd || '|' || coalesce(array_to_string(roles, ','), '-') ||
       '|' || coalesce(qual, '-') || '|' || coalesce(with_check, '-')
  from pg_policies
 where schemaname = 'public'
   and tablename in ('profiles','plan_items','user_program_state','documents','document_status',
                     'program_predictions','application_attempts','outcome_events')
 order by tablename, policyname;
