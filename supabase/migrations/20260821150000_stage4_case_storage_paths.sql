-- =====================================================================================
-- MV-190 — Stage 4 slice 3: the case-keyed Storage prefix becomes WRITABLE, and BOUNDED.
--
-- Spec: docs/superpowers/specs/2026-08-20-case-document-collaboration.md §4 (D3), §6 (D4, D5).
-- Card: docs/kanban/cards/MV-190-case-storage-and-downloads.md
-- Extends: 20260821120000_stage4_case_document_collaboration.sql (MV-185). It re-creates NONE of
--          MV-185's policies, adds no trigger, and drops nothing. Two statements of substance.
--
-- WHAT THIS ADDS: one column on one INSERT grant, and one CHECK constraint. That is the whole
-- migration. Its size is not its risk — both statements exist because the spec pass measured the
-- live catalogue and found the documented path unwritable and the column it lives in unbounded.
--
-- ================================ WHAT THIS FILE DOES NOT DO ================================
-- **NO `storage.objects` POLICY.** Spec §4 (3) said one would be added "for the `case/` prefix …
-- defence in depth". §6.1 measured the bucket and superseded it. The three policies that exist —
-- a `service_role` INSERT with no path check, and PUBLIC SELECT/DELETE both keyed on
-- `(storage.foldername(name))[1] = auth.uid()::text` — already deny the new prefix to every
-- client, because `foldername[1]` is the literal `case` and that is no uid. Every write already
-- runs as `service_role`, which bypasses RLS outright. So a SELECT policy admitting
-- `authenticated` to `case/` would be a SECOND path to the same bytes and the WEAKER one: it
-- would restate "may this actor staff this case" as a policy expression, and any drift between
-- that expression and `checkCasePermission` is a hole with no failing test behind it.
--
-- The absence is a decision, so §3 (6) below ASSERTS it: no `storage.objects` policy may admit a
-- non-`service_role` without keying on `auth.uid()`, and none may mention the `case/` prefix at
-- all. A later slice that re-adds the declined policy trips this file before it trips a reviewer.
--
-- **NOTHING IN `documents` OR `document_status`** — no column, policy, grant or index, the same
-- fence MV-182 and MV-185 held. §3 (7) and (8) assert both halves, including that
-- `documents_case_kind_idx` is still UNIQUE and still FULL: supabase-js compiles `.upsert()` to
-- `INSERT … ON CONFLICT DO UPDATE`, the arbiter index must exist and be FULL, and dropping or
-- narrowing it breaks every vault upsert at PLAN time (42501/42P10 — MV-155 and MV-168 measured
-- this three times between them).
--
-- **NO MIGRATION OF EXISTING OWNER-KEYED VAULT OBJECTS.** They are live student PII; a
-- copy-and-rewrite of `documents.file_path` is a data-loss-shaped operation with nothing to gain.
-- Counsellors reach a vault file through a signed URL minted after our own case authorization.
-- =====================================================================================

-- =====================================================================
-- 1  `id` joins the versions INSERT grant — spec §6.2 (D5)
-- =====================================================================
-- MV-185 granted nine columns and withheld `id`, with a reason stated in its own suite: "an id the
-- client chose is not a key the server issued". That is a sound default and this is the case that
-- outweighs it, for a reason about FAILURE ORDERING rather than preference:
--
--   The object path is `case/<case_id>/<version_id>` (spec §4). Without `id`, a client cannot know
--   the path until the row exists, so the sequence must be INSERT -> UPLOAD. A failed upload then
--   leaves a version row pointing at bytes that do not exist — and there is NO DELETE GRANT to
--   retract it, so MV-185's derivation holds the request `outstanding` behind a file nobody can
--   open, repairable only by a service-role write to a tenant table.
--
--   A client-generated id inverts it: UPLOAD -> INSERT. A failed upload writes no row at all; a
--   failed insert orphans an object nothing references. That is the cheaper failure by a wide
--   margin, and the same trade `app/api/documents/upload/route.ts` already makes for the vault.
--
-- Nothing else rested on the id being server-issued. Uniqueness is the primary key's; provenance is
-- `uploaded_by = auth.uid()`; tenancy is MV-185's five conjuncts plus §2 below. A colliding uuid is
-- a `23505` on an unguessable value, and §6.1 means a guessable one reaches no bytes either.
--
-- The alternative that looked tidiest — a `before insert` trigger computing the path from a
-- server-issued id — is the one this reasoning rejects: it FORCES insert-then-upload.
--
-- `created_at` stays absent. It is the server's account of when the file arrived, not the client's
-- claim about it, and no path is named after it.
--
-- Grants are additive and re-runnable, so this needs no `if not exists` wrapper.
grant insert (id, case_id, organization_id, request_id, document_id,
              storage_path, file_size, original_name, content_type, uploaded_by)
  on public.case_document_versions to authenticated;

-- STILL NO UPDATE GRANT AND STILL NO DELETE GRANT, on either table. §3 (3) and (4) assert both.
-- Granting `id` widens WHICH COLUMNS AN INSERT MAY NAME; it does not make the row mutable, and the
-- append-only property is what makes MV-185's request-status derivation total.

-- =====================================================================
-- 2  `storage_path` is bounded to the row's own case — spec §6.2 (D5)
-- =====================================================================
-- THE HOLE THIS CLOSES, stated plainly. MV-185 shipped `storage_path` as unconstrained text on
-- purpose, and said so at …20260821120000….sql:87-89:
--
--   "there is deliberately NO check constraint on the shape here, because pinning the prefix in
--    this file would decide MV-190's authorization model from a slice that ships none."
--
-- This is that slice. Without the bound, a counsellor staffing case X may insert a version ON CASE
-- X whose `storage_path` reads `case/<case_y>/…`. MV-190's helper authorizes the CASE and then
-- signs the PATH, so a legitimate authorization on case X would mint a signed URL for case Y's
-- bytes — and a signed URL bypasses Storage RLS by design. This is MV-161's finding, the one MV-185
-- applied to `document_id` before the fact (its §7 conjunct 4), arriving on the column MV-185 left
-- open for this card.
--
-- A TABLE CHECK, NOT A POLICY CONJUNCT, for three reasons:
--
--  1. **It binds every role, `service_role` included.** A WITH CHECK binds `authenticated` alone,
--     and the upload half of this model reaches Storage on the admin client. The integration suite
--     has one assertion issued on the service-role client for exactly this reason, and only a CHECK
--     can pass it.
--  2. **It does not touch MV-185's policy.** `supabase/rehearsal/MV-185-mutation.sql` restates that
--     policy byte-for-byte and RESTORES BY RE-RUNNING MV-185's migration. A sixth conjunct added
--     there would be silently reverted by any later MV-185 rehearsal, with nothing going red.
--  3. **`like`, not `=`.** The prefix is the security property. Pinning the whole string would also
--     forbid two versions on one case naming the same object — but that aliasing gains no
--     privilege, since both objects sit inside one case and anyone authorized to download the
--     second is by construction authorized to download the first. It is a data-integrity confusion
--     the path builder prevents, not a boundary. Against that, `=` forecloses a file extension for
--     no gain (`content_type` is a column HERE, which is why the vault's owner-keyed paths carry an
--     extension and these do not).
--
-- A uuid rendered as text contains only hex digits and hyphens, so the pattern carries no `%`/`_`
-- wildcard hazard. `case_id` is NOT NULL, so the concatenation is never NULL and the check is never
-- vacuously true.
--
-- Postgres has no `add constraint if not exists`, so the MV-159 idempotence idiom is a catalogue
-- probe. Added VALIDATED (no `not valid`): a `not valid` constraint lets pre-existing rows escape
-- it forever, which is precisely the guarantee this file is here to give.
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class c on c.oid = con.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'case_document_versions'
       and con.conname = 'case_document_versions_storage_path_case_prefix'
  ) then
    alter table public.case_document_versions
      add constraint case_document_versions_storage_path_case_prefix
      check (storage_path like 'case/' || case_id::text || '/%');
  end if;
end $$;

comment on constraint case_document_versions_storage_path_case_prefix on public.case_document_versions is
  'MV-190 (spec §6.2): a version may only ever name an object under ITS OWN case''s prefix. Signed '
  'URLs bypass Storage RLS, so an unbounded storage_path turns an authorization on case X into a '
  'download of case Y. A CHECK rather than a policy conjunct so it binds service_role too.';

-- =====================================================================
-- 3  the grant, the bound, the declined policy and the FENCE are asserted at APPLY time
--    (MV-159 §13 / MV-185 §8 idiom)
-- =====================================================================
-- Every assertion answers a way this file could be silently widened — or its fence silently crossed
-- — by a LATER migration. The ones about ABSENCES are the load-bearing half: an absence is what no
-- denial test can distinguish from a broken fixture, so it is asserted on the catalogue instead.
do $$
declare
  v_bad    text;
  v_cols   text;
  v_n      int;
  v_tables int;
begin
  -- (1) the versions INSERT grant is EXACTLY the ten columns, and `created_at` is not among them.
  --     A later table-level `grant insert on … to authenticated` would hand over `created_at` too.
  select string_agg(column_name, ', ' order by column_name) into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name = 'case_document_versions' and privilege_type = 'INSERT';
  if v_cols is distinct from 'case_id, content_type, document_id, file_size, id, organization_id, '
                             'original_name, request_id, storage_path, uploaded_by' then
    raise exception 'MV-190: the case_document_versions INSERT grant is (%), expected exactly '
      '(case_id, content_type, document_id, file_size, id, organization_id, original_name, '
      'request_id, storage_path, uploaded_by)', coalesce(v_cols, '<none>');
  end if;

  -- (2) MV-190 widens ONE grant on ONE table. The reviews grant is untouched — a review id is
  --     issued by the server because nothing names an object after it.
  select string_agg(column_name, ', ' order by column_name) into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name = 'case_document_reviews' and privilege_type = 'INSERT';
  if v_cols is distinct from 'case_id, decision, note, organization_id, reviewed_by, version_id' then
    raise exception 'MV-190: the case_document_reviews INSERT grant is (%), expected MV-185''s '
      'six columns unchanged', coalesce(v_cols, '<none>');
  end if;

  -- (3) STILL NO UPDATE GRANT on either table. Granting `id` widens what an INSERT may NAME; it
  --     must not have made the row mutable. MV-185's derivation only re-runs on INSERT, so an
  --     UPDATE grant would let the newest-version answer change with no trigger firing.
  select string_agg(table_name || '(' || column_name || ')', ', ' order by table_name, column_name)
    into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name in ('case_document_versions', 'case_document_reviews')
     and privilege_type = 'UPDATE';
  if v_cols is not null then
    raise exception 'MV-190: `authenticated` holds UPDATE on % — both collaboration tables are '
      'append-only, and MV-185''s request-status derivation depends on it', v_cols;
  end if;

  -- (4) STILL NO DELETE. `has_table_privilege` rather than `role_table_grants`, because the
  --     question is what a client CAN DO and not which GRANT statement was typed (MV-168 §4 (4)
  --     measured that a `grant delete … to public` is invisible to the latter).
  foreach v_bad in array array['case_document_versions', 'case_document_reviews'] loop
    if has_table_privilege('authenticated', 'public.' || v_bad, 'DELETE') then
      raise exception 'MV-190: `authenticated` acquired DELETE on % — with a client-chosen id, a '
        'delete grant would also make the version id RE-USABLE', v_bad;
    end if;
  end loop;

  -- (5) the storage_path bound exists, is a CHECK, is VALIDATED, and still names both columns.
  --     A `not valid` constraint lets pre-existing rows escape it; a constraint that stopped
  --     mentioning `case_id` would bound the prefix to the literal `case/` and nothing further,
  --     which is the exact hole this file exists to close.
  select con.contype::text || '|' || con.convalidated::text || '|' ||
         pg_catalog.pg_get_constraintdef(con.oid)
    into v_cols
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'case_document_versions'
     and con.conname = 'case_document_versions_storage_path_case_prefix';
  if v_cols is null then
    raise exception 'MV-190: case_document_versions_storage_path_case_prefix is gone — a version '
      'can name ANOTHER case''s object, and the signed-URL helper authorizes the case and then '
      'signs the path (spec §6.2)';
  end if;
  if v_cols not like 'c|true|%' then
    raise exception 'MV-190: the storage_path bound is not a VALIDATED check constraint (%)', v_cols;
  end if;
  if v_cols not like '%storage_path%' or v_cols not like '%case_id%' then
    raise exception 'MV-190: the storage_path bound no longer relates storage_path to case_id (%)',
      v_cols;
  end if;

  -- (6) THE DECLINED POLICY, asserted as an absence — spec §6.1 (D4).
  --     Two separate sentences, because a later slice could cross either one alone.
  select string_agg(p.polname, ', ' order by p.polname) into v_bad
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects'
     -- `service_role` bypasses RLS anyway, so a service_role-only policy is not a client path.
     and not (
       array_length(p.polroles, 1) = 1
       and exists (select 1 from pg_catalog.pg_roles r
                    where r.oid = any (p.polroles) and r.rolname = 'service_role')
     )
     and coalesce(pg_catalog.pg_get_expr(p.polqual, c.oid), '') ||
         coalesce(pg_catalog.pg_get_expr(p.polwithcheck, c.oid), '') not like '%auth.uid()%';
  if v_bad is not null then
    raise exception 'MV-190: storage.objects policy % admits a non-service_role without keying on '
      'auth.uid(). Direct client access to the documents bucket is uid-keyed or it does not exist '
      '(spec §6.1) — a case-scoped read is a signed URL minted after checkCasePermission.', v_bad;
  end if;

  --     The second sentence catches the policy the FIRST one cannot: an expression that keys on
  --     `auth.uid()` somewhere AND still admits the `case/` prefix. TWO SPELLINGS are matched,
  --     because the obvious one is not the one an author writes. A path-prefix policy is written
  --     `(storage.foldername(name))[1] = 'case'` — the folder name, with NO SLASH — and the
  --     `%case/%` pattern alone sails straight past it. This was measured: the `storage_case_read`
  --     mutant in supabase/rehearsal/MV-190-mutation.sql slipped this guard until the quoted-token
  --     form was added. (The uppercase SQL `CASE` keyword cannot match either pattern: `pg_get_expr`
  --     renders the keyword unquoted and in caps.)
  select string_agg(p.polname, ', ' order by p.polname) into v_bad
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects'
     and (
       coalesce(pg_catalog.pg_get_expr(p.polqual, c.oid), '') ||
       coalesce(pg_catalog.pg_get_expr(p.polwithcheck, c.oid), '') like '%case/%'
       or
       coalesce(pg_catalog.pg_get_expr(p.polqual, c.oid), '') ||
       coalesce(pg_catalog.pg_get_expr(p.polwithcheck, c.oid), '') like '%''case''%'
     );
  if v_bad is not null then
    raise exception 'MV-190: storage.objects policy % grants direct access to the `case/` prefix. '
      'Spec §6.1 declined that policy DELIBERATELY: it would be a second and weaker path to bytes '
      'already reachable only through an authorized mint. Re-read §6.1 before removing this.', v_bad;
  end if;

  -- (7) THE FENCE — `documents_case_kind_idx` must still exist, still be UNIQUE and still be FULL.
  --     MV-185 §8 (11) asserts the same thing at its own timestamp; keeping it alive here is the
  --     point, because the index is what every `.upsert()` on the vault plans against.
  if not exists (
    select 1
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ic on ic.oid = i.indexrelid
      join pg_catalog.pg_class tc on tc.oid = i.indrelid
      join pg_catalog.pg_namespace n on n.oid = tc.relnamespace
     where n.nspname = 'public'
       and tc.relname = 'documents'
       and ic.relname = 'documents_case_kind_idx'
       and i.indisunique
       and i.indpred is null
  ) then
    raise exception 'MV-190: documents_case_kind_idx is gone, no longer UNIQUE, or has become '
      'PARTIAL — every `.upsert()` on the vault now fails at PLAN time (42501/42P10). This file '
      'must not touch `documents`, and neither must whatever removed it.';
  end if;

  -- (8) the other half of the same fence: the vault's grant surface is SELECT-only at column scope.
  --     Stage 2 left it that way and MV-190 touches Storage OBJECTS, never the vault's table.
  select string_agg(privilege_type || ':' || column_name, ', ' order by privilege_type, column_name)
    into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public' and table_name = 'documents';
  if v_cols is distinct from 'SELECT:case_id, SELECT:created_at, SELECT:file_path, '
                             'SELECT:file_size, SELECT:id, SELECT:kind, SELECT:original_name, '
                             'SELECT:owner' then
    raise exception 'MV-190: the `documents` column grants for `authenticated` are (%), expected '
      'Stage 2''s SELECT-only surface. This file promised to touch nothing in the vault.',
      coalesce(v_cols, '<none>');
  end if;

  -- (9) THE CENSUS IS UNDISTURBED. Seven exact-count guards read `%_case` and each is phrased "on
  --     the nine". MV-190 adds no policy anywhere, so it must be invisible to all of them.
  select count(*), count(distinct c.relname) into v_n, v_tables
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polname like '%\_case';
  if v_n <> 27 or v_tables <> 9 then
    raise exception 'MV-190: the `%%_case` census reads % policies on % tables, expected 27 on 9. '
      'MV-190 adds no policy at all, so anything else here came from another file.', v_n, v_tables;
  end if;
end $$;
