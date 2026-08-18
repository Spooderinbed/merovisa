-- =====================================================================================
-- MV-182 — Stage 4 slice 1: the document CHASE LIST.
--
-- Spec: docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md §5 (every
-- document-shaped thing is Stage 4) and §6.1 rows 7 and 8.
-- Roadmap: docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md,
-- §"Absorb into the consultancy work".
--
-- WHAT THIS ADDS: one new table. A counsellor asks a case for a specific document, sees what is
-- still outstanding, and sees it resolve. That is the whole slice.
--
-- WHY IT IS A NEW TABLE AND NOT A COLUMN ON THE VAULT. `documents` and `document_status` each
-- carry `UNIQUE (case_id, kind)`, so today's model is strictly ONE DOCUMENT PER KIND PER CASE.
-- There is no row in either table that can hold "we asked for this on the 3rd and it has not
-- arrived", and there is no second row for "we asked again after the first one was rejected".
-- Widening either table to carry a request would mean dropping that uniqueness — which is
-- exactly the "extend the current single-owner design" the roadmap refuses, because the eventual
-- Stage 4 model is requests -> versions -> reviews and the uniqueness has to go once, on purpose,
-- with the whole model behind it. So this file adds a table BESIDE the vault and changes nothing
-- in it.
--
-- WHAT THIS FILE DOES NOT DO, and must never do in this slice:
--   * nothing to `documents` or `document_status` — no column, no policy, no grant, no index.
--   * no `storage.objects` policy, no bucket, no case-aware object path, no signed download.
--     Stage 2 §8 pinned object paths owner-keyed and only the Storage slice moves them.
--   * no document versions, no reviews, no case-activity feed.
--   * NO `UPDATE (case_id)` AND NO `UPDATE (organization_id)` GRANT.
--     `…20260802120000….sql:602-604` states the rule the first would break — "a client that can
--     UPDATE case_id RE-POINTS an existing row into another case". `organization_id` is the same
--     hazard one level up: a request re-pointed at another tenant's organization while keeping
--     its case. §5 (2) and §5 (3) below assert both at apply time.
--   * no upsert anywhere in the caller. supabase-js compiles `.upsert()` to
--     `INSERT … ON CONFLICT DO UPDATE SET` naming EVERY payload column, so a column-scoped INSERT
--     grant raises `42501` at plan time even on the insert branch (MV-155/MV-168 measured this
--     three times). `lib/cases/document-requests-repo.ts` inserts and updates separately.
--
-- Re-runnable in the MV-159 idiom: `create table if not exists`, `drop policy if exists` +
-- `create policy`, `create or replace function`, and grants are idempotent.
-- =====================================================================================

-- =====================================================================
-- 1  the table
-- =====================================================================
create table if not exists public.case_document_requests (
  id              uuid primary key default gen_random_uuid(),
  -- ON DELETE CASCADE, matching `case_assignments`: a request is operating data ABOUT a case and
  -- has no meaning once the case is gone. (`documents` is deliberately different — it holds a
  -- Storage pointer whose object outlives the row.)
  case_id         uuid not null references public.cases(id)         on delete cascade,
  -- NOT NULL, and pinned to the case's real organization by the INSERT policy below. A request is
  -- a CONSULTANCY act, so a personal case (`cases.organization_id is null`) can carry none: the
  -- policy's `organization_id = private.case_org_id(case_id)` conjunct compares against NULL
  -- there, and a WITH CHECK admits only TRUE.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- The EXACT DOCUMENT_KINDS array from lib/documents/types.ts — the same list, spelled the same
  -- way, as `documents.kind` (20260604060000) and `document_status.kind` (20260626000000). Keep
  -- all three in lockstep; `tests/documents/status-schema.test.ts`'s sibling for this table is
  -- `tests/cases/document-requests-repo.test.ts`.
  kind            text not null check (kind in (
                    'passport','birth-certificate','national-id',
                    'slc-see','plus-two','bachelors-transcript','masters-transcript',
                    'ielts','pte','toefl',
                    'bank-statement','loan-sanction','sponsor-income',
                    'employment-letter','salary-slip',
                    'offer-letter','coe','oshc','medical','other')),
  -- The short label the chase list shows. It exists ALONGSIDE `kind` rather than being derived
  -- from it because the same kind is asked for in different shapes — "Father's bank statement"
  -- and "Applicant's bank statement" are two requests of kind `bank-statement`, and a list that
  -- rendered both as "Bank Statement" would be telling the counsellor they had asked twice for
  -- the same thing. `note` is the instruction; this is the name.
  title           text not null,
  note            text,
  -- NO `cancelled`. A two-state model is the whole verb this slice ships, and an enum value with
  -- no caller is a promise the UI does not keep. The consequence is stated rather than hidden: a
  -- request created in error is closed by RESOLVING it, and the follow-up card owns cancellation
  -- along with the rest of the request -> version -> review model.
  status          text not null default 'outstanding'
                    check (status in ('outstanding','resolved')),
  due_at          timestamptz,
  -- Provenance. Pinned to the actor by the INSERT policy — it is not a column the client may
  -- choose a value for, only one it must state truthfully.
  requested_by    uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- NEVER CLIENT-WRITABLE. Stamped by the trigger in §3 and held out of both grants in §4, for
  -- the same reason `created_at`/`updated_at` are: it is the server's account of when something
  -- happened, not the client's claim about it. §5 (4) asserts the absence.
  resolved_at     timestamptz
);

-- The list query is "this case's requests, outstanding first" — case_id leads, so this is also
-- the case_id FK's covering index.
create index if not exists case_document_requests_case_id_status_idx
  on public.case_document_requests (case_id, status);
-- FK cover for the two remaining references.
create index if not exists case_document_requests_organization_id_idx
  on public.case_document_requests (organization_id);
create index if not exists case_document_requests_requested_by_idx
  on public.case_document_requests (requested_by);

-- =====================================================================
-- 2  RLS on from the first line
-- =====================================================================
-- FORCE as well as ENABLE, the idiom every table in this schema uses: without it the table's
-- OWNER bypasses its own policies, and "owner" includes the role migrations run as.
alter table public.case_document_requests enable row level security;
alter table public.case_document_requests force  row level security;

-- =====================================================================
-- 3  resolved_at is stamped, never supplied
-- =====================================================================
create or replace function private.stamp_document_request_resolution()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- Resolving stamps. Re-resolving an already-resolved request does NOT re-stamp: the first
  -- branch requires the row to have been outstanding, so the original time survives an
  -- idempotent write.
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_at := now();
  -- Re-opening clears. Leaving a stale `resolved_at` on an outstanding request would render as
  -- "resolved on the 3rd" beside "still outstanding", and a reader has no way to tell which half
  -- is the lie.
  elsif new.status is distinct from 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists case_document_requests_stamp_resolution on public.case_document_requests;
create trigger case_document_requests_stamp_resolution
before update on public.case_document_requests
for each row execute function private.stamp_document_request_resolution();

drop trigger if exists case_document_requests_set_updated_at on public.case_document_requests;
create trigger case_document_requests_set_updated_at
before update on public.case_document_requests
for each row execute function private.set_updated_at();

-- =====================================================================
-- 4  grants — column-scoped, in the MV-161 / MV-168 idiom
-- =====================================================================
revoke all on public.case_document_requests from anon, authenticated;

grant select on public.case_document_requests to authenticated;

-- `status` is ABSENT from the INSERT list on purpose: a request is created outstanding or it is
-- not created. `resolved_at`, `created_at` and `updated_at` are absent for the reason stated on
-- the columns themselves. This is the same split `plan_items`' INSERT grant makes, applied to a
-- verb that has exactly one legal starting state.
grant insert (case_id, organization_id, kind, title, note, due_at, requested_by)
  on public.case_document_requests to authenticated;

-- EXACTLY `status`. This is the whole mutable surface: resolve, and re-open. Widening it to
-- `resolved_at` would let a client date its own resolution; widening it to `case_id` or
-- `organization_id` would let it re-point the row into another case or tenant.
grant update (status) on public.case_document_requests to authenticated;

-- NO DELETE GRANT, and no DELETE policy. A request that was asked for is a fact about how the
-- case was worked, and removing the row removes the record that it was ever chased. Same reading
-- as `plan_items` DELETE (spec §6.1 row 6): items are closed by status, never deleted.

-- =====================================================================
-- 5  policies
-- =====================================================================
drop policy if exists case_document_requests_select_actor on public.case_document_requests;

-- NAMED `_select_actor`, NOT `_select_case`, AND THAT IS LOAD-BEARING. The `%_case` suffix is not
-- a style convention in this repo — it is the census key for MV-159's twenty-four policies on the
-- NINE student-owned tables. Seven exact-count guards read it (`MV-159/160/168-rollback.sql` and
-- `supabase/rehearsal/README.md`), each asserting a total and each phrased "on the nine". A tenth
-- table adopting the suffix silently enrols itself in that census and makes every one of those
-- rollbacks refuse with a misleading count. Do not rename this back.
--
-- READ rides the case axis, exactly like the nine student-owned tables: `actor_case_ids()` is the
-- linked student's own case, plus the admin/owner's whole organization, plus a counsellor's
-- assigned cases. So the linked STUDENT can read what has been asked of them — which is the cell
-- `CASE_PERMISSION_MATRIX.student["case.read"] = "linked"` already promises, and the surface that
-- will show it to them is Stage 5's.
--
-- The array form is deliberate and is not a style choice: `x = any ((select f()))` is an
-- uncorrelated InitPlan evaluated ONCE per statement, while `(select f(col))` correlates on a
-- column and can only ever be a per-row SubPlan (MV-152's measured finding).
create policy case_document_requests_select_actor on public.case_document_requests
  for select to authenticated
  using (case_id = any ((select private.actor_case_ids())::uuid[]));

drop policy if exists case_document_requests_insert_staff on public.case_document_requests;

-- THREE CONJUNCTS, and dropping any one of them is a distinct hole:
--
--  1. `can_staff_case` and NOT `actor_case_ids` — asking a case for a document is something the
--     CONSULTANCY does to a case. `can_staff_case` is `can_access_case` minus the student
--     disjunct, and that subtraction is the entire point (canonical matrix, divergence 6): the
--     student's own link must not launder them into the counsellor's chair on their own file.
--     Swap this for `actor_case_ids()` and a student can mint requests against themselves.
--  2. `organization_id = private.case_org_id(case_id)` — the ORG axis. Without it the column is
--     whatever the client typed, so a request could sit on org A's case while claiming to belong
--     to org B, and every organization-scoped report built on this table later would be wrong.
--     It is also what refuses a personal case: `case_org_id` returns NULL there, and NULL = NULL
--     is NULL, which a WITH CHECK refuses exactly like FALSE.
--  3. `requested_by = auth.uid()` — the PROVENANCE axis, the same shape as `profiles_insert_case`'s
--     owner conjunct. Without it a counsellor may attribute their own request to a colleague, and
--     "who chased this" stops being evidence of anything.
create policy case_document_requests_insert_staff on public.case_document_requests
  for insert to authenticated
  with check (
    private.can_staff_case(case_id)
    and organization_id = private.case_org_id(case_id)
    and requested_by = (select auth.uid())
  );

drop policy if exists case_document_requests_update_staff on public.case_document_requests;

-- Resolving is a staff act too, so the same predicate on both sides. WITH CHECK as well as USING:
-- without it the policy states which rows may be touched but not which rows may result, and the
-- granted column set is the only thing left deciding — which is a grant doing a policy's job.
create policy case_document_requests_update_staff on public.case_document_requests
  for update to authenticated
  using (private.can_staff_case(case_id))
  with check (private.can_staff_case(case_id));

-- =====================================================================
-- 6  the grants and policies are asserted at APPLY time, in the MV-159 §13 idiom
-- =====================================================================
-- Every assertion answers a way this file could be silently widened by a LATER migration that
-- re-creates one of these objects. A conjunct only an attacker notices is exactly the conjunct a
-- future "simplification" removes, and the suite would stay green: nothing in `lib/` or `app/`
-- writes a foreign `organization_id` or a foreign `requested_by`, so no legitimate path breaks.
do $$
declare
  v_bad  text;
  v_cols text;
begin
  -- (1) the INSERT policy still bounds BOTH the org axis and the provenance axis.
  select pg_catalog.pg_get_expr(p.polwithcheck, c.oid) into v_bad
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
   where p.polname = 'case_document_requests_insert_staff';
  if v_bad is null then
    raise exception 'MV-182: case_document_requests_insert_staff has no WITH CHECK — an INSERT '
      'grant with an unfiltered policy is an UNFILTERED verb';
  end if;
  if v_bad not like '%case_org_id%' then
    raise exception 'MV-182: the INSERT policy no longer bounds the ORG axis — a request could sit '
      'on one tenant''s case while claiming to belong to another (%)' , v_bad;
  end if;
  if v_bad not like '%can_staff_case%' then
    raise exception 'MV-182: the INSERT policy no longer uses can_staff_case — can_access_case or '
      'actor_case_ids here would let the LINKED STUDENT mint requests against their own case (%)', v_bad;
  end if;
  if v_bad not like '%auth.uid()%' then
    raise exception 'MV-182: the INSERT policy no longer bounds `requested_by` to the actor — one '
      'counsellor could attribute a request to another (%)', v_bad;
  end if;

  -- (2) THE ASYMMETRY, re-asserted over the whole schema. Checked everywhere rather than on this
  --     table alone because the rule is the schema's, not this file's (MV-168 §4 (2)).
  select string_agg(distinct table_name, ', ' order by table_name) into v_bad
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and privilege_type = 'UPDATE'
     and column_name = 'case_id';
  if v_bad is not null then
    raise exception 'MV-182: `authenticated` holds UPDATE (case_id) on % — a client with that grant '
      'can re-point an existing row into another case (…20260802120000….sql:602-604)', v_bad;
  end if;

  -- (3) the same hazard one level up. `organization_id` is a tenant pointer on this table and on
  --     `cases`, `invitations` and `audit_events`; a client that can UPDATE it moves a row across
  --     the tenant boundary while every case-axis predicate keeps saying yes.
  select string_agg(distinct table_name, ', ' order by table_name) into v_bad
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and privilege_type = 'UPDATE'
     and column_name = 'organization_id';
  if v_bad is not null then
    raise exception 'MV-182: `authenticated` holds UPDATE (organization_id) on % — that re-points a '
      'row across the TENANT boundary while the case axis still reads correct', v_bad;
  end if;

  -- (4) `resolved_at` is not client-writable by EITHER verb. The trigger is what stamps it, and a
  --     grant would make the trigger advisory: PostgREST would happily carry a client-chosen value
  --     for any row the trigger's branches leave alone.
  select string_agg(privilege_type, ', ' order by privilege_type) into v_bad
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and table_name = 'case_document_requests'
     and column_name = 'resolved_at'
     and privilege_type in ('INSERT', 'UPDATE');
  if v_bad is not null then
    raise exception 'MV-182: `authenticated` holds % on case_document_requests.resolved_at — the '
      'resolution time is the server''s account of when something happened, not the client''s', v_bad;
  end if;

  -- (5) the INSERT grant did not leak past its enumerated column list. A later table-level
  --     `grant insert on public.case_document_requests to authenticated` would hand over
  --     `status`, `resolved_at`, `created_at` and `updated_at` too, and this catches it.
  select string_agg(column_name, ', ' order by column_name) into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and table_name = 'case_document_requests'
     and privilege_type = 'INSERT';
  if v_cols is distinct from 'case_id, due_at, kind, note, organization_id, requested_by, title' then
    raise exception 'MV-182: the INSERT grant is (%), expected exactly (case_id, due_at, kind, note, '
      'organization_id, requested_by, title)', coalesce(v_cols, '<none>');
  end if;

  -- (6) the UPDATE grant is EXACTLY `status`.
  select string_agg(column_name, ', ' order by column_name) into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and table_name = 'case_document_requests'
     and privilege_type = 'UPDATE';
  if v_cols is distinct from 'status' then
    raise exception 'MV-182: the UPDATE grant is (%), expected exactly (status)', coalesce(v_cols, '<none>');
  end if;

  -- (7) NO DELETE, asserted as the ABSENCE of a grant — the kind of fact that disappears without
  --     anybody deciding to remove it. `has_table_privilege` rather than `role_table_grants`,
  --     because the question is what a client CAN DO and not which GRANT statement was typed:
  --     MV-168 §4 (4) measured that a `grant delete … to public` is invisible to the latter.
  --     DELETE is table-level and never appears in `column_privileges` at all.
  if has_table_privilege('authenticated', 'public.case_document_requests', 'DELETE') then
    raise exception 'MV-182: `authenticated` acquired DELETE on case_document_requests — a request '
      'is the record that a document was chased, and deleting the row deletes that record';
  end if;

  -- (8) RLS is enabled AND FORCED. Enabled alone leaves the table owner — which includes the role
  --     migrations run as — bypassing every policy above.
  select string_agg(
           case when not c.relrowsecurity then 'not enabled' end || coalesce(
           case when not c.relforcerowsecurity then ' / not forced' end, ''), '') into v_bad
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'case_document_requests'
     and (not c.relrowsecurity or not c.relforcerowsecurity);
  if v_bad is not null then
    raise exception 'MV-182: row level security on case_document_requests is %', v_bad;
  end if;

  -- (9) all three policies exist and are attached to the verb they claim. A `drop policy` in a
  --     later file leaves the GRANT behind, and a granted verb with no policy is unfiltered.
  select string_agg(want.polname || ' (' || want.cmd || ')', ', ' order by want.polname) into v_bad
    from (values
      ('case_document_requests_select_actor', 'r'),
      ('case_document_requests_insert_staff', 'a'),
      ('case_document_requests_update_staff', 'w')
    ) as want(polname, cmd)
   where not exists (
     select 1 from pg_catalog.pg_policy p
      where p.polname = want.polname and p.polcmd = want.cmd::"char"
   );
  if v_bad is not null then
    raise exception 'MV-182: missing policy %, but the matching grant is in place — a granted verb '
      'with no policy is an UNFILTERED verb', v_bad;
  end if;

  -- (10) the resolution stamp is still a trigger. Drop it and `resolved_at` silently stops being
  --      written at all: no grant means no client can supply it, so every resolved request would
  --      carry a NULL resolution time and the list would render "resolved" with no date beside it.
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'case_document_requests'
     and t.tgname = 'case_document_requests_stamp_resolution'
     and not t.tgisinternal
  ) then
    raise exception 'MV-182: the resolution-stamp trigger is gone — `resolved_at` is client-ungrantable, '
      'so without the trigger nothing writes it and every resolved request loses its date';
  end if;
end $$;
