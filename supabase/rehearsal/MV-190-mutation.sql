-- MV-190 — the MUTATION harness: revert (or PLANT) ONE clause, prove a NAMED test goes red.
--
-- Card: docs/kanban/cards/MV-190-case-storage-and-downloads.md, test plan — "RLS mutation tests on
--       the new `storage.objects` policy — drop it and watch a named test go red. A denial-only
--       probe passes against a missing policy."
-- Spec: docs/superpowers/specs/2026-08-20-case-document-collaboration.md §6.1 (D4), §6.2 (D5).
-- Migration under test: supabase/migrations/20260821150000_stage4_case_storage_paths.sql
--
-- ---------------------------------------------------------------------------------------------
-- WHY THIS FILE LOOKS DIFFERENT FROM MV-185's
-- ---------------------------------------------------------------------------------------------
-- MV-185 mutated by SUBTRACTION, because everything it shipped was a policy conjunct: remove one,
-- watch the sentence it enforced stop being true. MV-190's central decision is an **ABSENCE** —
-- spec §6.1 declined to add a `storage.objects` policy for the `case/` prefix, on the grounds that
-- the bucket already denies it (`(storage.foldername(name))[1]` is the literal `case`, which is no
-- uid) and that a second path to the same bytes would be the weaker one.
--
-- **For an absence, the mutant is an ADDITION.** `storage_case_read` PLANTS the policy §6.1
-- declined and the criterion-5 denial tests must go red. A denial test that survives that mutant
-- was never testing anything — it was passing on a fixture that never uploaded, a wrong bucket, or
-- a token the Storage service never accepted.
--
-- `storage_own_read` is the other half of that argument and is the reason the suite has a CONTROL:
-- it drops the policy the control depends on. If a mutant that breaks Storage reads for EVERYBODY
-- leaves the "counsellor is refused" tests green while turning the control red, then those refusals
-- are about the `case/` prefix and not about a broken client. That distinction is the whole
-- evidentiary value of this file.
--
-- LOCAL ONLY, AND IT MUTATES COMMITTED STATE: it drops a live constraint, drops a live Storage
-- policy, or grants a client a read it must not have. Between the mutation and the restore the
-- local database is deliberately vulnerable. NEVER point this at the hosted project.
--
-- Usage — four calls per mutant, in this order:
--   $PSQL = "docker exec -i supabase_db_merovisa psql -U postgres -d postgres -v ON_ERROR_STOP=1"
--   $PSQL -v mutant=path_check -f - < supabase/rehearsal/MV-190-mutation.sql       # mutate
--   npx vitest run --config vitest.integration.config.ts tests/integration/stage4-case-storage.itest.ts
--   $PSQL -v mutant=restore -f - < supabase/rehearsal/MV-190-mutation.sql          # undo the plant
--   $PSQL -f - < supabase/migrations/20260821150000_stage4_case_storage_paths.sql  # re-assert
--
-- THE `restore` STEP IS NOT OPTIONAL AND THE MIGRATION ALONE IS NOT ENOUGH. Two reasons, both
-- measured:
--   * The migration adds the constraint `if not exists`. `path_check_loose` and
--     `path_check_not_valid` re-create it under the SAME NAME, so the probe finds one and the
--     weakened version survives. `restore` drops it by name first.
--   * `storage_case_read` PLANTS a policy the migration never created, so the migration cannot
--     drop it — its §3 (6) assertion instead REFUSES, which is the guard working correctly but
--     leaves the mutant in place.
-- Running the migration last is still what makes this safe: it re-grants, re-adds and re-asserts,
-- so a restore that did not restore refuses instead of passing quietly.
--
-- EVERY CLAUSE BELOW IS RESTATED BYTE-FOR-BYTE FROM THE MIGRATION (or, for the two Storage
-- policies, from the live catalogue). A mutant differs from the shipped schema in exactly the
-- named clause, so a red test cannot be blamed on anything else.
--
-- ---------------------------------------------------------------------------------------------
-- mutant                 does                                     the tests that must go red
-- ---------------------------------------------------------------------------------------------
-- id_grant               revoke insert (id)                       "grants `id` on the versions
--                                                                  INSERT, so the client can name
--                                                                  the object before it writes the
--                                                                  row"
--                                                                 "ADMITS a version whose path sits
--                                                                  under its own case, written with
--                                                                  a client-chosen id"
-- path_check             drop the storage_path constraint         "bounds storage_path to the row's
--                                                                  own case with a VALIDATED check
--                                                                  constraint"
--                                                                 "REFUSES a version on this case
--                                                                  whose storage_path names ANOTHER
--                                                                  case"
--                                                                 "REFUSES a version whose
--                                                                  storage_path is an owner-keyed
--                                                                  vault path rather than
--                                                                  case-keyed"
--                                                                 "binds `service_role` too, which
--                                                                  is the half a policy conjunct
--                                                                  could not reach"
-- path_check_loose       `like 'case/%'` — the prefix, but not    "REFUSES a version on this case
--                        THIS ROW'S case                           whose storage_path names ANOTHER
--                                                                  case"
--                                                                 "binds `service_role` too …"
--                                                                 "bounds storage_path to the row's
--                                                                  own case …"
--                        (the owner-keyed refusal stays GREEN — which is the point: this mutant
--                         isolates the CROSS-CASE half from the "is it case-keyed at all" half)
-- path_check_not_valid   same predicate, added NOT VALID          "bounds storage_path to the row's
--                                                                  own case with a VALIDATED check
--                                                                  constraint"
--                        (every insert-time refusal stays GREEN — NOT VALID still checks NEW rows.
--                         What it stops checking is rows that already exist, which is why the
--                         suite asserts `convalidated` and not merely `contype`.)
-- storage_case_read      PLANT the SELECT policy §6.1 declined    "REFUSES a direct download of a
--                                                                  case/ object to the counsellor
--                                                                  who may staff that case"
--                                                                 "REFUSES a direct download of a
--                                                                  case/ object to an outsider as
--                                                                  well"
--                                                                 "carries exactly the three known
--                                                                  policies, each bound to the verb
--                                                                  it claims"
--                                                                 "admits no non-service_role
--                                                                  policy that fails to key on
--                                                                  auth.uid()"
--                                                                 "carries no policy that mentions
--                                                                  the case/ prefix at all"
-- storage_own_read       drop `Users read own document files`     "CONTROL — the same actor, same
--                                                                  client, same run CAN download
--                                                                  their own uid-keyed object"
--                                                                 "carries exactly the three known
--                                                                  policies …"
--                        (THE COUNSELLOR AND OUTSIDER REFUSALS MUST STAY GREEN. If they went red
--                         here too, the refusals would be about Storage auth being broken rather
--                         than about the `case/` prefix, and criterion 5 would be unproven.)
-- restore                undo every plant, drop the constraint    — (run the migration after it)
-- ---------------------------------------------------------------------------------------------

\set ON_ERROR_STOP on
\if :{?mutant}
\else
  \echo 'MV-190 mutation harness: pass -v mutant=<name>. See the table in this file for the names.'
  \quit
\endif

select set_config('mv190.mutant', :'mutant', false);

do $$
declare
  m text := current_setting('mv190.mutant', true);

  -- The shipped predicate, restated from §2 of the migration.
  bound  text := 'storage_path like ''case/'' || case_id::text || ''/%''';
  -- The same predicate with the ROW'S OWN CASE removed — every `case/`-prefixed path passes.
  loose  text := 'storage_path like ''case/%''';

  -- The live `storage.objects` read policy, restated from the catalogue so the drop is reversible.
  own_read text := '(bucket_id = ''documents''::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)';

  known text[] := array['id_grant','path_check','path_check_loose','path_check_not_valid',
                        'storage_case_read','storage_own_read','restore'];
begin
  if m is null or not (m = any (known)) then
    raise exception 'MV-190 mutation: unknown mutant %. Known: %', coalesce(m, '<none>'), array_to_string(known, ', ');
  end if;

  -- --- the grant ---------------------------------------------------------------------------
  -- Revoked rather than the whole INSERT grant: this mutant must admit exactly one change — the
  -- client can no longer NAME the row — so the red tests are about `id` and not about writes.
  if m = 'id_grant' then
    revoke insert (id) on public.case_document_versions from authenticated;
    raise notice 'MUTANT id_grant: `authenticated` can no longer supply case_document_versions.id.';
  end if;

  -- --- the storage_path bound --------------------------------------------------------------
  if m in ('path_check', 'path_check_loose', 'path_check_not_valid', 'restore') then
    alter table public.case_document_versions
      drop constraint if exists case_document_versions_storage_path_case_prefix;
  end if;

  if m = 'path_check' then
    raise notice 'MUTANT path_check: storage_path is unbounded — a version may name ANY object.';
  end if;

  if m = 'path_check_loose' then
    execute format(
      'alter table public.case_document_versions
         add constraint case_document_versions_storage_path_case_prefix check (%s)', loose);
    raise notice 'MUTANT path_check_loose: the prefix is bounded, THIS ROW''S CASE is not.';
  end if;

  if m = 'path_check_not_valid' then
    execute format(
      'alter table public.case_document_versions
         add constraint case_document_versions_storage_path_case_prefix check (%s) not valid', bound);
    raise notice 'MUTANT path_check_not_valid: new rows are checked, pre-existing rows are exempt.';
  end if;

  -- --- the DECLINED policy, planted ---------------------------------------------------------
  -- The shape §6.1 argued against: a direct client read of the `case/` prefix. Deliberately the
  -- GENEROUS form (no case check at all) rather than a careful one, because the argument is not
  -- "a case-scoped policy would be written wrongly" — it is that a second path to these bytes is
  -- redundant with the mint and cannot be kept in step with it. The generous form is what a later
  -- author reaches for first, and it is what the tests must notice.
  if m = 'storage_case_read' then
    drop policy if exists mv190_mutant_case_prefix_read on storage.objects;
    create policy mv190_mutant_case_prefix_read on storage.objects
      for select to authenticated
      using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'case');
    raise notice 'MUTANT storage_case_read: any authenticated actor may read the case/ prefix.';
  end if;

  -- --- the CONTROL's policy, dropped --------------------------------------------------------
  if m = 'storage_own_read' then
    drop policy if exists "Users read own document files" on storage.objects;
    raise notice 'MUTANT storage_own_read: NOBODY may read their own uid-keyed object. The case/ '
      'refusals must stay GREEN — only the control may fall.';
  end if;

  -- --- restore ------------------------------------------------------------------------------
  -- Undoes the two Storage plants and clears the constraint by NAME so the migration's
  -- `if not exists` probe cannot mistake a weakened one for the real thing. The migration is what
  -- puts the constraint and the grant back, and what re-asserts all nine guards.
  if m = 'restore' then
    drop policy if exists mv190_mutant_case_prefix_read on storage.objects;
    drop policy if exists "Users read own document files" on storage.objects;
    execute format(
      'create policy "Users read own document files" on storage.objects for select using (%s)', own_read);
    raise notice 'RESTORE: plants removed, constraint cleared. NOW RUN '
      'supabase/migrations/20260821150000_stage4_case_storage_paths.sql — it re-grants, re-adds and '
      're-asserts, so a restore that did not restore refuses instead of passing quietly.';
  end if;
end $$;
