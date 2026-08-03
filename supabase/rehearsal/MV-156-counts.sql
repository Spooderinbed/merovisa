-- MV-156 — DATA fingerprint. Run at every capture point of the rehearsal; the output must be
-- BYTE-IDENTICAL at all four, because MV-156 writes no row data.
--
--   psql -tAX -v ON_ERROR_STOP=1 -f supabase/rehearsal/MV-156-counts.sql
--
-- MV-155's equivalent had to tolerate a backfill that UPDATEs nine tables. This one does not:
-- MV-156 is pure DDL. The ONLY thing it does to existing rows is add a surrogate `id` with a
-- VOLATILE default to `user_program_state` and `document_status`, which rewrites those two tables.
-- A rewrite must not change any OTHER column — so the fingerprints below EXCLUDE `id` on exactly
-- those two tables and nothing else, which makes them directly comparable across the pre-migration,
-- post-migration, post-rollback and post-re-apply states.
--
-- `to_jsonb(t) - 'id'` is a no-op on a state where the column does not exist yet, which is why one
-- script works at all four points rather than needing a pre- and a post- variant that could drift.
--
-- WHAT A DIFFERENCE HERE WOULD MEAN, so a reader knows what they are looking at:
--   * a changed `profiles` / `user_program_state` updated_at fingerprint → the ADD COLUMN rewrite
--     fired `private.set_updated_at()`, destroying "when did this student last edit their profile".
--     DDL is not supposed to fire row-level triggers; this is the assertion of that, not the
--     assumption of it.
--   * a changed `case_id` fill → the rewrite fired MV-155's `_derive_case_id` seam trigger.
--   * any changed whole-row fingerprint → the migration is not inert for existing rows.

\echo '--- row counts (the nine) ---'
select 'profiles='             || count(*)::text from public.profiles
union all select 'assessments='          || count(*)::text from public.assessments
union all select 'plan_items='           || count(*)::text from public.plan_items
union all select 'user_program_state='   || count(*)::text from public.user_program_state
union all select 'documents='            || count(*)::text from public.documents
union all select 'document_status='      || count(*)::text from public.document_status
union all select 'program_predictions='  || count(*)::text from public.program_predictions
union all select 'application_attempts=' || count(*)::text from public.application_attempts
union all select 'outcome_events='       || count(*)::text from public.outcome_events
union all select 'cases_personal='       || count(*)::text from public.cases where organization_id is null
union all select 'auth_users='           || count(*)::text from auth.users;

\echo '--- ownership axes: owner null / case_id null, per table ---'
select 'profiles ownernull='             || count(*) filter (where owner is null)::text
     || ' casenull=' || count(*) filter (where case_id is null)::text from public.profiles
union all select 'assessments ownernull=' || count(*) filter (where owner is null)::text
     || ' casenull=' || count(*) filter (where case_id is null)::text from public.assessments
union all select 'plan_items ownernull=' || count(*) filter (where owner is null)::text
     || ' casenull=' || count(*) filter (where case_id is null)::text from public.plan_items
union all select 'user_program_state ownernull=' || count(*) filter (where owner is null)::text
     || ' casenull=' || count(*) filter (where case_id is null)::text from public.user_program_state
union all select 'documents ownernull=' || count(*) filter (where owner is null)::text
     || ' casenull=' || count(*) filter (where case_id is null)::text from public.documents
union all select 'document_status ownernull=' || count(*) filter (where owner is null)::text
     || ' casenull=' || count(*) filter (where case_id is null)::text from public.document_status
union all select 'program_predictions ownernull=' || count(*) filter (where owner is null)::text
     || ' casenull=' || count(*) filter (where case_id is null)::text from public.program_predictions
union all select 'application_attempts ownernull=' || count(*) filter (where owner is null)::text
     || ' casenull=' || count(*) filter (where case_id is null)::text from public.application_attempts
union all select 'outcome_events ownernull=' || count(*) filter (where owner is null)::text
     || ' casenull=' || count(*) filter (where case_id is null)::text from public.outcome_events;

\echo '--- whole-row fingerprints (surrogate id excluded on the two rewritten tables) ---'
select 'fp profiles='             || coalesce(md5(string_agg(h,'' order by h)),'EMPTY')
  from (select md5(to_jsonb(t)::text) h from public.profiles t) s
union all select 'fp assessments=' || coalesce(md5(string_agg(h,'' order by h)),'EMPTY')
  from (select md5(to_jsonb(t)::text) h from public.assessments t) s
union all select 'fp plan_items=' || coalesce(md5(string_agg(h,'' order by h)),'EMPTY')
  from (select md5(to_jsonb(t)::text) h from public.plan_items t) s
union all select 'fp user_program_state=' || coalesce(md5(string_agg(h,'' order by h)),'EMPTY')
  from (select md5((to_jsonb(t) - 'id')::text) h from public.user_program_state t) s
union all select 'fp documents=' || coalesce(md5(string_agg(h,'' order by h)),'EMPTY')
  from (select md5(to_jsonb(t)::text) h from public.documents t) s
union all select 'fp document_status=' || coalesce(md5(string_agg(h,'' order by h)),'EMPTY')
  from (select md5((to_jsonb(t) - 'id')::text) h from public.document_status t) s
union all select 'fp program_predictions=' || coalesce(md5(string_agg(h,'' order by h)),'EMPTY')
  from (select md5(to_jsonb(t)::text) h from public.program_predictions t) s
union all select 'fp application_attempts=' || coalesce(md5(string_agg(h,'' order by h)),'EMPTY')
  from (select md5(to_jsonb(t)::text) h from public.application_attempts t) s
union all select 'fp outcome_events=' || coalesce(md5(string_agg(h,'' order by h)),'EMPTY')
  from (select md5(to_jsonb(t)::text) h from public.outcome_events t) s;

\echo '--- updated_at fingerprints (the two tables carrying set_updated_at) ---'
select 'fp updated_at profiles=' || coalesce(md5(string_agg(updated_at::text,'' order by updated_at::text)),'EMPTY')
  from public.profiles
union all
select 'fp updated_at user_program_state=' || coalesce(md5(string_agg(updated_at::text,'' order by updated_at::text)),'EMPTY')
  from public.user_program_state
union all
select 'fp updated_at document_status=' || coalesce(md5(string_agg(updated_at::text,'' order by updated_at::text)),'EMPTY')
  from public.document_status;

\echo '--- row identity: every pre-migration row id must still exist (id-bearing tables) ---'
select 'ids profiles='             || coalesce(md5(string_agg(id::text,',' order by id::text)),'EMPTY') from public.profiles
union all select 'ids assessments=' || coalesce(md5(string_agg(id::text,',' order by id::text)),'EMPTY') from public.assessments
union all select 'ids plan_items='  || coalesce(md5(string_agg(id::text,',' order by id::text)),'EMPTY') from public.plan_items
union all select 'ids documents='   || coalesce(md5(string_agg(id::text,',' order by id::text)),'EMPTY') from public.documents
union all select 'ids program_predictions=' || coalesce(md5(string_agg(id::text,',' order by id::text)),'EMPTY') from public.program_predictions
union all select 'ids application_attempts=' || coalesce(md5(string_agg(id::text,',' order by id::text)),'EMPTY') from public.application_attempts
union all select 'ids outcome_events=' || coalesce(md5(string_agg(id::text,',' order by id::text)),'EMPTY') from public.outcome_events;

-- The two rewritten tables have no stable surrogate id before MV-156, so their identity is their
-- LEGACY KEY PAIR — which is exactly the thing the PK replacement must preserve.
\echo '--- row identity: the two rewritten tables, keyed on their legacy pair ---'
select 'keys user_program_state=' ||
       coalesce(md5(string_agg(owner::text || '|' || program_id, ',' order by owner::text, program_id)),'EMPTY')
  from public.user_program_state
union all
select 'keys document_status=' ||
       coalesce(md5(string_agg(owner::text || '|' || kind, ',' order by owner::text, kind)),'EMPTY')
  from public.document_status;

\echo '--- MV-155 reconciliation (must stay CLEAN throughout) ---'
select 'mv155_assert_case_backfill=CLEAN' from (select private.mv155_assert_case_backfill()) s;
