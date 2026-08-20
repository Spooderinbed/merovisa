-- =====================================================================================
-- MV-185 — Stage 4 slice 2: the document COLLABORATION model. Versions and reviews.
--
-- Spec: docs/superpowers/specs/2026-08-20-case-document-collaboration.md §2 (D1), §3 (D2), §5.
-- Card: docs/kanban/cards/MV-185-collaboration-schema.md
-- Extends: 20260818120000_stage4_case_document_requests.sql (MV-182), whose table this file adds
--          ONE trigger to. It re-creates none of MV-182's policies and changes none of its grants.
--
-- WHAT THIS ADDS: two tables. A file ARRIVES against a request (`case_document_versions`) and is
-- then ACCEPTED or REJECTED (`case_document_reviews`). MV-182 shipped the chase list; nothing
-- could arrive against it and nothing could be judged. That is the whole slice.
--
-- ============================== THE HEADER MV-182 WROTE IS SUPERSEDED ==============================
-- MV-182's header states the intent as "the eventual Stage 4 model is requests -> versions ->
-- reviews and the uniqueness has to go once, on purpose, with the whole model behind it". THE
-- UNIQUENESS DOES NOT GO, and it does not go HERE least of all. Spec §2 weighed it and decided the
-- other way, for three reasons; the sharpest is mechanical:
--
--   `public.documents` carries `UNIQUE (case_id, kind)` as `documents_case_kind_idx`
--   (…20260802120000….sql:157). supabase-js compiles `.upsert()` to `INSERT … ON CONFLICT DO
--   UPDATE`, and the ARBITER INDEX MUST EXIST AND BE FULL. Drop that index and `upsertDocument`
--   and `app/api/documents/upload` stop planning — a `42501`/`42P10` at plan time, not a review
--   comment. MV-155 and MV-168 measured this failure three times between them. §8 (11) below
--   asserts the index survived THIS file.
--
-- The other two reasons are products, not mechanics: `documents` is the STUDENT version's vault and
-- "the current file for this kind on this case" is a fact `lib/checklist/generator.ts` and the
-- profile sections depend on; and the consultancy model needs HISTORY and REVIEW, which are facts
-- about a REQUEST, not about the vault. So versions sit BESIDE the vault exactly as MV-182 put
-- requests beside it, and a version carries an OPTIONAL `document_id` for the case where a version
-- *is* the vault's current file.
--
-- WHAT THIS FILE DOES NOT DO, and must never do in this slice:
--   * nothing to `documents` or `document_status` — no column, no policy, no grant, no index, and
--     above all no `drop index documents_case_kind_idx`. The FK `case_document_versions.document_id
--     -> documents(id)` is a reference, not a change: it adds no column, policy, grant or index to
--     the vault and leaves its RLS untouched.
--   * no `storage.objects` policy, no bucket, no case-keyed object path, no signed download. All of
--     that is MV-190, whose risk class (a migration on a schema Supabase owns, plus three routes)
--     is why spec §4 split it off. `storage_path` is a COLUMN here and nothing more.
--   * no routes and no UI. MV-190 does the routes; MV-186 does the UI. There is deliberately no
--     repository module in this slice either: a `lib/cases/…-repo.ts` with no caller is speculative
--     code, and the verbs it would expose are MV-190's to shape.
--   * NO `UPDATE (case_id)` AND NO `UPDATE (organization_id)` GRANT — the two forbidden grants
--     MV-182 §6 (2) and (3) assert schema-wide, inherited verbatim. Either one re-points a live row
--     into another case or another tenant. Both tables here go further and carry NO `UPDATE` GRANT
--     AT ALL (§6), so the two forbidden columns are absent by construction as well as by rule.
--   * no upsert in any caller. A column-scoped INSERT grant raises `42501` at plan time even on the
--     insert branch, because `.upsert()` names every payload column in its `DO UPDATE SET`.
--     `lib/cases/document-requests-repo.ts` inserts and updates separately; whatever MV-190 writes
--     against these tables must too.
--   * nothing reads `cases.student_user_id`. It is nullable — "not yet claimed"
--     (…stage1_tenancy_core.sql:80) — and an UNCLAIMED case supports the whole
--     request -> version -> review walk. This slice genuinely precedes Stage 5.
--
-- Re-runnable in the MV-159 idiom: `create table if not exists`, `create index if not exists`,
-- `create or replace function`, `drop trigger if exists` + `create trigger`, `drop policy if exists`
-- + `create policy`, and grants are idempotent.
-- =====================================================================================

-- =====================================================================
-- 1  case_document_versions — a file that arrived against a request
-- =====================================================================
create table if not exists public.case_document_versions (
  id              uuid primary key default gen_random_uuid(),
  -- ON DELETE CASCADE for the same reason MV-182 gives: a version is operating data ABOUT a case
  -- and has no meaning once the case is gone. (`documents` is deliberately different — it holds a
  -- Storage pointer whose object outlives the row.)
  case_id         uuid not null references public.cases(id)         on delete cascade,
  -- NOT NULL and pinned to the case's real organization by the INSERT policy in §7. A version is a
  -- CONSULTANCY act on a consultancy case, so a personal case (`cases.organization_id is null`)
  -- can carry none: `case_org_id` returns NULL there and a WITH CHECK admits only TRUE.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- NOT NULL. Every version arrives AGAINST A REQUEST — that is what "version" means in this model,
  -- and an unrequested file is what the VAULT is for. Making this nullable would create a second,
  -- unnamed kind of row with no request to resolve and no chase list to appear on.
  --
  -- THERE IS DELIBERATELY NO `unique (request_id)`. Re-upload after a rejection is the entire point
  -- of the model: a request accumulates versions, and the newest one is the one under judgement.
  request_id      uuid not null references public.case_document_requests(id) on delete cascade,
  -- NULLABLE, and bounded to this case by the INSERT policy's fourth conjunct. Set when a version
  -- IS the vault's current file for its kind; NULL once the vault moves on (`on delete set null`),
  -- or when the file never entered the vault at all. Reading it is MV-190's business — it is
  -- bounded here anyway, for the reason MV-161's header gives about `supersedes_prediction_id`:
  -- the conjunct costs nothing now, and "harmless" is a property of code that does not exist yet.
  document_id     uuid references public.documents(id) on delete set null,
  -- The Storage object this version points at. MV-190 fills it with `case/<case_id>/<version_id>`
  -- (spec §4) — there is deliberately NO check constraint on the shape here, because pinning the
  -- prefix in this file would decide MV-190's authorization model from a slice that ships none.
  storage_path    text not null,
  -- `integer`, not `bigint`, mirroring `documents.file_size` exactly. Two columns describing the
  -- same file in two tables that disagree on width is a conversion waiting to be forgotten.
  file_size       integer not null,
  original_name   text not null,
  -- Nullable, and the one column with no counterpart in the vault: `documents` carries no content
  -- type at all, so this is best-effort from the upload and never a guarantee.
  content_type    text,
  -- Provenance. Pinned to the actor by the INSERT policy — not a value the client may choose, only
  -- one it must state truthfully.
  uploaded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- THE DERIVATION'S INDEX, and the `request_id` FK's cover. §3's "newest version of this request" is
-- `order by created_at desc, id desc limit 1`, and this is that access path exactly.
create index if not exists case_document_versions_request_id_created_at_idx
  on public.case_document_versions (request_id, created_at desc, id desc);
-- FK cover for the four remaining references.
create index if not exists case_document_versions_case_id_idx
  on public.case_document_versions (case_id);
create index if not exists case_document_versions_organization_id_idx
  on public.case_document_versions (organization_id);
create index if not exists case_document_versions_document_id_idx
  on public.case_document_versions (document_id);
create index if not exists case_document_versions_uploaded_by_idx
  on public.case_document_versions (uploaded_by);

-- =====================================================================
-- 2  case_document_reviews — accepted or rejected, on one version
-- =====================================================================
create table if not exists public.case_document_reviews (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.cases(id)         on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- NOT NULL, and bounded to this case by the INSERT policy's fourth conjunct. A review is a
  -- judgement about ONE FILE; a review with no version is a judgement about nothing.
  version_id      uuid not null references public.case_document_versions(id) on delete cascade,
  -- TWO VALUES, and no `pending`. A row exists because somebody decided; "nobody has decided yet"
  -- is the ABSENCE of a row, which is a state the derivation in §3 already reads correctly. An
  -- enum value with no verb behind it is a promise the UI does not keep (MV-182's `cancelled`).
  decision        text not null check (decision in ('accepted','rejected')),
  -- The reason. Read by the linked STUDENT through `_select_actor` below, which is the whole point
  -- of storing it: "rejected" with no note is a wall, and Stage 5's surface is where it stops being
  -- one. Nullable because an acceptance rarely needs words.
  note            text,
  reviewed_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- THERE IS DELIBERATELY NO `unique (version_id)`. A reviewer who rejected in error must be able to
-- say so, and the model's answer to "the student re-uploads" cannot also be the answer to "I
-- misread the scan". So a version may carry several reviews and THE NEWEST ONE IS THE JUDGEMENT —
-- which is what §3 derives, and why this index exists.
create index if not exists case_document_reviews_version_id_created_at_idx
  on public.case_document_reviews (version_id, created_at desc, id desc);
create index if not exists case_document_reviews_case_id_idx
  on public.case_document_reviews (case_id);
create index if not exists case_document_reviews_organization_id_idx
  on public.case_document_reviews (organization_id);
create index if not exists case_document_reviews_reviewed_by_idx
  on public.case_document_reviews (reviewed_by);

-- =====================================================================
-- 3  RLS on from the first line, on both
-- =====================================================================
-- FORCE as well as ENABLE, the idiom every table in this schema uses: without it the table's OWNER
-- bypasses its own policies, and "owner" includes the role migrations run as.
alter table public.case_document_versions enable row level security;
alter table public.case_document_versions force  row level security;
alter table public.case_document_reviews  enable row level security;
alter table public.case_document_reviews  force  row level security;

-- =====================================================================
-- 4  the parentage helpers, and the DERIVATION
-- =====================================================================
-- SECURITY DEFINER for the reason MV-159's header states about `assessment_case_id` and the other
-- three: a table referenced inside a policy expression has ITS OWN RLS applied, which makes an
-- inline subquery both a recursion hazard and — quieter and worse — a SILENT DENIAL when the
-- parent row happens not to be visible through whichever disjunct the planner used. A definer
-- helper answers the parentage question on the DATA and not on the actor's current view of it.
--
-- Each returns NULL when the parent does not exist. NULL is the correct and SAFE answer: the
-- policies below compare with `=`, a comparison against NULL is NULL, and a WITH CHECK admits only
-- TRUE. So "parent not found", "parent has no case" and "parent is in another case" all deny, and
-- none can be turned into an existence oracle — `private` is not a PostgREST-exposed schema
-- (supabase/config.toml `[api] schemas`), so there is no RPC route to call them directly.
create or replace function private.document_request_case_id(p_request_id uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.case_id from public.case_document_requests r where r.id = p_request_id;
$$;

create or replace function private.document_version_case_id(p_version_id uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select v.case_id from public.case_document_versions v where v.id = p_version_id;
$$;

-- THE VAULT POINTER'S BOUND. `document_id` is `on delete set null` and points into a table full of
-- live student PII; MV-190 will resolve a version's vault file THROUGH this column to mint a signed
-- URL, and a signed URL bypasses Storage RLS by design. An unbounded pointer would therefore be a
-- cross-case disclosure the moment that helper is written. This is exactly MV-161's finding, and
-- the same answer: bound it now, in the policy, at top level.
create or replace function private.document_case_id(p_document_id uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select d.case_id from public.documents d where d.id = p_document_id;
$$;

-- =====================================================================
-- THE DERIVATION. Spec §3: "a request is resolved when its newest version has an accepted review."
--
-- THREE RETURN VALUES, and the third is the load-bearing one:
--   'resolved'    — the newest version's newest review is `accepted`.
--   'outstanding' — there is a newest version and it is not accepted (rejected, or not yet judged).
--   NULL          — THE REQUEST HAS NO VERSIONS, so the derivation has nothing to say.
--
-- NULL is what keeps MV-182's manual verb alive. A counsellor who received a passport by hand
-- resolves the request with `update … set status = 'resolved'` and no file ever arrives; there is
-- no version, the derivation abstains, and §5's guard lets the write through. The moment a version
-- DOES exist, the derivation becomes the answer and the guard refuses any hand-written
-- disagreement. That is the whole of "derived, never a second source of truth" — stated as a rule
-- about which rows the derivation SPEAKS FOR rather than as a silent overwrite.
--
-- "NEWEST" IS `(created_at, id)` DESC, NOT `created_at` ALONE. Two versions inserted in one
-- statement share a timestamp to the microsecond, and a derivation whose answer depends on which
-- row the planner returned first is a derivation that can disagree with itself between two reads.
-- The `id` tiebreak is arbitrary but TOTAL, which is the only property required.
--
-- "NEWEST REVIEW", not "any accepted review". Spec §3 says "has an accepted review", which is the
-- same sentence whenever a version carries at most one — and this file admits several on purpose
-- (§2). Where they differ, the newest is the only honest reading: a reviewer who accepts and then
-- rejects has rejected, and `exists (… 'accepted')` would call that resolved forever.
-- =====================================================================
create or replace function private.document_request_derived_status(p_request_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case
           when (
             select rv.decision
               from public.case_document_reviews rv
              where rv.version_id = v.id
              order by rv.created_at desc, rv.id desc
              limit 1
           ) = 'accepted' then 'resolved'
           else 'outstanding'
         end
    from public.case_document_versions v
   where v.request_id = p_request_id
   order by v.created_at desc, v.id desc
   limit 1;
$$;

-- Safe ONLY because `private` is not PostgREST-exposed — the same assumption MV-159 §12 records.
-- `document_request_derived_status` is granted to NOBODY: it is called only from the two SECURITY
-- DEFINER trigger functions below, which execute as the function owner, so the invoking client
-- never needs the privilege. Handing it to `authenticated` would add an RPC-shaped oracle for
-- nothing.
revoke all on function
  private.document_request_case_id(uuid),
  private.document_version_case_id(uuid),
  private.document_case_id(uuid),
  private.document_request_derived_status(uuid)
  from public;

grant execute on function private.document_request_case_id(uuid)  to authenticated;
grant execute on function private.document_version_case_id(uuid)  to authenticated;
grant execute on function private.document_case_id(uuid)          to authenticated;

-- =====================================================================
-- 5  the status of a request, written where it cannot disagree
-- =====================================================================
-- TWO TRIGGERS DOING TWO DIFFERENT JOBS.
--
-- (a) `sync_document_request_status` WRITES the derived status in the same statement that inserts
--     the version or the review. Spec §3 asks for exactly this — "the review verb writes it in the
--     same statement that inserts the review" — and a trigger is the only place that sentence can
--     be true for every caller, including MV-190's routes, a psql session and the service role.
--
--     It runs AFTER INSERT only, because INSERT is the only mutation either table admits: §6 grants
--     no UPDATE and no DELETE on either, so there is no client-reachable way to un-say a version or
--     a review, and therefore no other moment at which the derivation can change.
--
--     SECURITY DEFINER so the invariant does not depend on the writer's grants. The insert that
--     fires it is already policy-gated to an actor who may staff the case (§7's INSERT policies),
--     so this adds no reach — it only stops the invariant from being conditional on `update
--     (status)` still being granted to whoever happens to be reviewing.
--
-- (b) `guard_document_request_status` REFUSES a hand-written status that contradicts the
--     derivation. Without it, MV-182's still-live `resolveCaseDocumentRequest` could mark a request
--     resolved whose newest version was just REJECTED — and `case_document_requests.status` is the
--     column MV-183's lodgement panel reads, so that request would render as satisfied on the queue
--     while the only file against it had been refused. That is the disagreement acceptance
--     criterion 4 forbids, and refusing loudly is the only honest way to forbid it: silently
--     rewriting the client's value would make the write report success and mean something else.
--
--     No request in production can reach this branch today — nothing can create a version until
--     MV-190 ships a route — so this trigger changes no live behaviour. It exists before the
--     routes, not after, because a guard added after the hole is a guard added after the incident.
create or replace function private.sync_document_request_status()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_request_id uuid;
  v_derived    text;
begin
  -- One function, two tables: a version names its request directly, a review reaches it through
  -- the version it judges. Two near-identical functions is one future migration fixing one of them.
  if tg_table_name = 'case_document_versions' then
    v_request_id := new.request_id;
  else
    select v.request_id into v_request_id
      from public.case_document_versions v
     where v.id = new.version_id;
  end if;

  if v_request_id is null then return null; end if;

  v_derived := private.document_request_derived_status(v_request_id);
  -- Cannot happen from an AFTER INSERT on either table — the row that fired this IS a version, or
  -- hangs off one — but abstaining is the safe branch if it ever can, because the alternative is
  -- overwriting a manually resolved request with a value nothing derived.
  if v_derived is null then return null; end if;

  update public.case_document_requests
     set status = v_derived
   where id = v_request_id
     -- `is distinct from` and not `<>`: a no-op write would still fire
     -- `stamp_document_request_resolution`, whose re-resolve branch is a no-op but whose
     -- `set_updated_at` sibling is not. A request's `updated_at` should move when its status moves.
     and status is distinct from v_derived;

  return null;
end;
$$;

create or replace function private.guard_document_request_status()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_derived text;
begin
  -- Only a status CHANGE is in scope. Every other update to a request — there are none granted
  -- today — passes untouched, and the sync trigger's own write passes because it writes exactly
  -- the derived value.
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_derived := private.document_request_derived_status(new.id);

  if v_derived is not null and new.status is distinct from v_derived then
    raise exception
      'MV-185: request % is resolved by its documents, not by hand. Its newest version derives '
      '"%" and this write says "%". Accept or reject the newest version instead.',
      new.id, v_derived, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists case_document_versions_sync_request_status on public.case_document_versions;
create trigger case_document_versions_sync_request_status
after insert on public.case_document_versions
for each row execute function private.sync_document_request_status();

drop trigger if exists case_document_reviews_sync_request_status on public.case_document_reviews;
create trigger case_document_reviews_sync_request_status
after insert on public.case_document_reviews
for each row execute function private.sync_document_request_status();

-- The ONLY thing this file changes about MV-182's table. Named `_status_guard` so it sorts after
-- `_set_updated_at` and `_stamp_resolution`; the order is immaterial today because none of the
-- three reads a column another writes, and it is pinned by name rather than left to luck.
drop trigger if exists case_document_requests_status_guard on public.case_document_requests;
create trigger case_document_requests_status_guard
before update on public.case_document_requests
for each row execute function private.guard_document_request_status();

-- =====================================================================
-- 6  grants — column-scoped, in the MV-161 / MV-168 idiom
-- =====================================================================
revoke all on public.case_document_versions from anon, authenticated;
revoke all on public.case_document_reviews  from anon, authenticated;

grant select on public.case_document_versions to authenticated;
grant select on public.case_document_reviews  to authenticated;

-- `created_at` is absent for the same reason MV-182 withholds it: it is the server's account of
-- when something happened, not the client's claim about it.
grant insert (case_id, organization_id, request_id, document_id,
              storage_path, file_size, original_name, content_type, uploaded_by)
  on public.case_document_versions to authenticated;

grant insert (case_id, organization_id, version_id, decision, note, reviewed_by)
  on public.case_document_reviews to authenticated;

-- NO UPDATE GRANT ON EITHER TABLE, AND NO DELETE GRANT ON EITHER TABLE.
--
-- Both tables are APPEND-ONLY to a client, and each row is a record of something that happened: a
-- file arrived, a person judged it. Changing a review is done by writing another one (§2); the
-- vault pointer is cleared by `on delete set null` and not by hand.
--
-- The absence is also what makes the derivation in §4 total. `sync_document_request_status` fires
-- on INSERT alone; if a client could delete a version or rewrite a decision, the newest-version
-- answer could change with nothing firing, and `case_document_requests.status` would drift from it
-- silently. §8 (5) and (6) assert both absences, because they are the kind of fact that disappears
-- without anybody deciding to remove it.

-- =====================================================================
-- 7  policies
-- =====================================================================
drop policy if exists case_document_versions_select_actor on public.case_document_versions;

-- NAMED `_select_actor`, NOT `_select_case`, FOR THE REASON MV-182'S COMMENT GIVES AT LENGTH: the
-- `%_case` suffix is the census key seven exact-count guards read (`MV-159/160/168-rollback.sql`,
-- `supabase/rehearsal/README.md`), each asserting a total and each phrased "on the nine". A table
-- adopting the suffix silently enrols itself and makes every one of those rollbacks refuse with a
-- misleading count. §8 (10) asserts the census is still 27 policies on 9 tables.
--
-- READ rides the case axis, so the LINKED STUDENT sees the versions on their own case and the
-- reviews of them — including a rejection note, which is the half of this model that is any use to
-- them. That is the cell `CASE_PERMISSION_MATRIX.student["case.read"] = "linked"` already promises.
--
-- The array form is deliberate: `x = any ((select f()))` is an uncorrelated InitPlan evaluated ONCE
-- per statement, while `(select f(col))` correlates on a column and can only be a per-row SubPlan
-- (MV-152's measured finding).
create policy case_document_versions_select_actor on public.case_document_versions
  for select to authenticated
  using (case_id = any ((select private.actor_case_ids())::uuid[]));

drop policy if exists case_document_versions_insert_staff on public.case_document_versions;

-- FIVE CONJUNCTS. Dropping any one of them is a distinct hole:
--
--  1. `can_staff_case` and NOT `actor_case_ids` — the STAFF axis. `can_staff_case` is
--     `can_access_case` minus the student disjunct, and that subtraction is the point (canonical
--     matrix, divergence 6). Swap it and a linked student uploads counsellor-side versions on their
--     own file, which is the same laundering MV-182 refused for requests.
--  2. `organization_id = private.case_org_id(case_id)` — the ORG axis. Without it the column is
--     whatever the client typed, and every organization-scoped report built on this table later is
--     wrong. It is also what refuses a personal case: `case_org_id` is NULL there.
--  3. `private.document_request_case_id(request_id) = case_id` — the PARENTAGE axis. Without it a
--     counsellor staffing case X attaches a version to a request on case Y: the row would read as
--     case X's to every case-scoped query, and would resolve case Y's request through the trigger
--     in §5. Both halves are wrong and neither is visible from either case.
--  4. `document_id is null or private.document_case_id(document_id) = case_id` — the VAULT-POINTER
--     axis, MV-161's finding applied before the fact. `document_id` is optional, so the null arm is
--     required; without the second arm a version can name ANOTHER CASE'S vault file, and MV-190
--     mints signed URLs — which bypass Storage RLS by design — from exactly this pointer.
--  5. `uploaded_by = auth.uid()` — the PROVENANCE axis. Without it one counsellor may attribute an
--     upload to a colleague, and "who filed this" stops being evidence of anything.
create policy case_document_versions_insert_staff on public.case_document_versions
  for insert to authenticated
  with check (
    private.can_staff_case(case_id)
    and organization_id = private.case_org_id(case_id)
    and private.document_request_case_id(request_id) = case_id
    and (document_id is null or private.document_case_id(document_id) = case_id)
    and uploaded_by = (select auth.uid())
  );

drop policy if exists case_document_reviews_select_actor on public.case_document_reviews;

create policy case_document_reviews_select_actor on public.case_document_reviews
  for select to authenticated
  using (case_id = any ((select private.actor_case_ids())::uuid[]));

drop policy if exists case_document_reviews_insert_staff on public.case_document_reviews;

-- The same four axes, one table further down the chain. Conjunct 3 is `document_version_case_id`
-- here for the identical reason: without it a review lands on another case's version and resolves
-- another case's request. THE STAFF CONJUNCT IS THE CARD'S HEADLINE — "a linked student must not
-- review their own file" — and it is `can_staff_case` that says so.
create policy case_document_reviews_insert_staff on public.case_document_reviews
  for insert to authenticated
  with check (
    private.can_staff_case(case_id)
    and organization_id = private.case_org_id(case_id)
    and private.document_version_case_id(version_id) = case_id
    and reviewed_by = (select auth.uid())
  );

-- =====================================================================
-- 8  the grants, policies, triggers and the FENCE are asserted at APPLY time (MV-159 §13 idiom)
-- =====================================================================
-- Every assertion answers a way this file could be silently widened — or its fence silently
-- crossed — by a LATER migration that re-creates one of these objects. A conjunct only an attacker
-- notices is exactly the conjunct a future "simplification" removes, and the suite would stay
-- green: nothing in `lib/` or `app/` writes a foreign `organization_id`, so no legitimate path
-- breaks.
do $$
declare
  v_bad  text;
  v_cols text;
  v_n    int;
begin
  -- (1) both INSERT policies still bound every axis they claim.
  for v_bad, v_cols in
    select p.polname, coalesce(pg_catalog.pg_get_expr(p.polwithcheck, c.oid), '')
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
     where p.polname in ('case_document_versions_insert_staff', 'case_document_reviews_insert_staff')
  loop
    if v_cols = '' then
      raise exception 'MV-185: % has no WITH CHECK — an INSERT grant with an unfiltered policy is '
        'an UNFILTERED verb', v_bad;
    end if;
    if v_cols not like '%can_staff_case%' then
      raise exception 'MV-185: % no longer uses can_staff_case — can_access_case or actor_case_ids '
        'here would let the LINKED STUDENT upload and review on their own case (%)', v_bad, v_cols;
    end if;
    if v_cols not like '%case_org_id%' then
      raise exception 'MV-185: % no longer bounds the ORG axis — the row could sit on one tenant''s '
        'case while claiming to belong to another (%)', v_bad, v_cols;
    end if;
    if v_cols not like '%auth.uid()%' then
      raise exception 'MV-185: % no longer pins provenance to the actor — one counsellor could '
        'attribute an upload or a judgement to another (%)', v_bad, v_cols;
    end if;
  end loop;

  -- (1b) the two PARENTAGE bounds and the VAULT-POINTER bound, named individually because each one
  --      is a different sentence and a "simplification" would take them one at a time.
  select coalesce(pg_catalog.pg_get_expr(p.polwithcheck, c.oid), '') into v_cols
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
   where p.polname = 'case_document_versions_insert_staff';
  if v_cols not like '%document_request_case_id%' then
    raise exception 'MV-185: the versions INSERT policy no longer bounds PARENTAGE — a version '
      'could hang off another case''s request and resolve it through the §5 trigger (%)', v_cols;
  end if;
  if v_cols not like '%document_case_id%' then
    raise exception 'MV-185: the versions INSERT policy no longer bounds the VAULT POINTER — a '
      'version could name another case''s `documents` row, and MV-190 mints signed URLs from it (%)',
      v_cols;
  end if;

  select coalesce(pg_catalog.pg_get_expr(p.polwithcheck, c.oid), '') into v_cols
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
   where p.polname = 'case_document_reviews_insert_staff';
  if v_cols not like '%document_version_case_id%' then
    raise exception 'MV-185: the reviews INSERT policy no longer bounds PARENTAGE — a review could '
      'land on another case''s version and resolve another case''s request (%)', v_cols;
  end if;

  -- (2) THE ASYMMETRY, re-asserted over the whole schema exactly as MV-182 §6 (2) does. Checked
  --     everywhere rather than on these two tables alone because the rule is the schema's.
  select string_agg(distinct table_name, ', ' order by table_name) into v_bad
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and privilege_type = 'UPDATE'
     and column_name = 'case_id';
  if v_bad is not null then
    raise exception 'MV-185: `authenticated` holds UPDATE (case_id) on % — a client with that grant '
      'can re-point an existing row into another case (…20260802120000….sql:602-604)', v_bad;
  end if;

  -- (3) the same hazard one level up: a row moved across the TENANT boundary while every case-axis
  --     predicate keeps saying yes.
  select string_agg(distinct table_name, ', ' order by table_name) into v_bad
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and privilege_type = 'UPDATE'
     and column_name = 'organization_id';
  if v_bad is not null then
    raise exception 'MV-185: `authenticated` holds UPDATE (organization_id) on % — that re-points a '
      'row across the TENANT boundary while the case axis still reads correct', v_bad;
  end if;

  -- (4) neither INSERT grant leaked past its enumerated column list. A later table-level
  --     `grant insert on … to authenticated` would hand over `created_at` too, and this catches it.
  select string_agg(column_name, ', ' order by column_name) into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name = 'case_document_versions' and privilege_type = 'INSERT';
  if v_cols is distinct from 'case_id, content_type, document_id, file_size, organization_id, '
                             'original_name, request_id, storage_path, uploaded_by' then
    raise exception 'MV-185: the case_document_versions INSERT grant is (%), expected exactly '
      '(case_id, content_type, document_id, file_size, organization_id, original_name, request_id, '
      'storage_path, uploaded_by)', coalesce(v_cols, '<none>');
  end if;

  select string_agg(column_name, ', ' order by column_name) into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name = 'case_document_reviews' and privilege_type = 'INSERT';
  if v_cols is distinct from 'case_id, decision, note, organization_id, reviewed_by, version_id' then
    raise exception 'MV-185: the case_document_reviews INSERT grant is (%), expected exactly '
      '(case_id, decision, note, organization_id, reviewed_by, version_id)', coalesce(v_cols, '<none>');
  end if;

  -- (5) NO UPDATE GRANT AT ALL on either table. This is the strong form of the card's two
  --     forbidden grants — `case_id` and `organization_id` cannot be re-pointed because NO column
  --     can be — and it is what makes the §4 derivation total, since the AFTER INSERT triggers are
  --     then the only events that can change it.
  select string_agg(table_name || '(' || column_name || ')', ', ' order by table_name, column_name)
    into v_cols
    from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name in ('case_document_versions', 'case_document_reviews')
     and privilege_type = 'UPDATE';
  if v_cols is not null then
    raise exception 'MV-185: `authenticated` acquired UPDATE on % — both tables are append-only, '
      'and the request-status derivation only re-runs on INSERT', v_cols;
  end if;

  -- (6) NO DELETE, asserted as the ABSENCE of a privilege. `has_table_privilege` rather than
  --     `role_table_grants`, because the question is what a client CAN DO and not which GRANT
  --     statement was typed: MV-168 §4 (4) measured that a `grant delete … to public` is invisible
  --     to the latter. DELETE is table-level and never appears in `column_privileges` at all.
  foreach v_bad in array array['case_document_versions', 'case_document_reviews'] loop
    if has_table_privilege('authenticated', 'public.' || v_bad, 'DELETE') then
      raise exception 'MV-185: `authenticated` acquired DELETE on % — a version is the record that '
        'a file arrived and a review is the record that somebody judged it', v_bad;
    end if;
  end loop;

  -- (7) RLS is enabled AND FORCED on both. Enabled alone leaves the table owner — which includes
  --     the role migrations run as — bypassing every policy above.
  select string_agg(c.relname || ': ' ||
           case when not c.relrowsecurity then 'not enabled' else '' end ||
           case when not c.relforcerowsecurity then ' not forced' else '' end, ', ' order by c.relname)
    into v_bad
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('case_document_versions', 'case_document_reviews')
     and (not c.relrowsecurity or not c.relforcerowsecurity);
  if v_bad is not null then
    raise exception 'MV-185: row level security is wrong on %', v_bad;
  end if;

  -- (8) all four policies exist and are attached to the verb they claim. A `drop policy` in a later
  --     file leaves the GRANT behind, and a granted verb with no policy is unfiltered.
  select string_agg(want.polname || ' (' || want.cmd || ')', ', ' order by want.polname) into v_bad
    from (values
      ('case_document_versions_select_actor', 'r'),
      ('case_document_versions_insert_staff', 'a'),
      ('case_document_reviews_select_actor',  'r'),
      ('case_document_reviews_insert_staff',  'a')
    ) as want(polname, cmd)
   where not exists (
     select 1 from pg_catalog.pg_policy p
      where p.polname = want.polname and p.polcmd = want.cmd::"char"
   );
  if v_bad is not null then
    raise exception 'MV-185: missing policy %, but the matching grant is in place — a granted verb '
      'with no policy is an UNFILTERED verb', v_bad;
  end if;

  -- (9) the three triggers exist. Drop the two sync triggers and `case_document_requests.status`
  --     silently stops tracking the documents; drop the guard and a hand-written status can
  --     contradict them, which is the disagreement acceptance criterion 4 forbids.
  select string_agg(want.tgname, ', ' order by want.tgname) into v_bad
    from (values
      ('case_document_versions_sync_request_status', 'case_document_versions'),
      ('case_document_reviews_sync_request_status',  'case_document_reviews'),
      ('case_document_requests_status_guard',        'case_document_requests')
    ) as want(tgname, relname)
   where not exists (
     select 1 from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = want.relname
       and t.tgname = want.tgname and not t.tgisinternal
   );
  if v_bad is not null then
    raise exception 'MV-185: missing trigger % — a request''s status and its documents can then '
      'disagree with nothing to stop them', v_bad;
  end if;

  -- (10) THE CENSUS IS UNDISTURBED. Seven exact-count guards read `%_case` and each is phrased
  --      "on the nine"; this file's four policies must be invisible to all of them.
  select count(*) into v_n
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polname like '%\_case';
  if v_n <> 27 then
    raise exception 'MV-185: the `%%_case` census reads % policies, expected MV-159''s 24 plus '
      'MV-168''s 3. A policy in this file has adopted the suffix and enrolled itself in a census '
      'seven rollback scripts assert totals against.', v_n;
  end if;

  select count(distinct c.relname) into v_n
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polname like '%\_case';
  if v_n <> 9 then
    raise exception 'MV-185: the `%%_case` census spans % tables, expected the nine student-owned '
      'tables and nothing else', v_n;
  end if;

  -- (11) THE FENCE, asserted rather than promised. `documents_case_kind_idx` must still exist, must
  --      still be UNIQUE and must still be FULL — a partial arbiter raises `42P10` and a missing one
  --      raises `42501` at plan time, both of which break EVERY `.upsert()` on the vault:
  --      `upsertDocument` and `app/api/documents/upload`'s atomic replace. MV-155 and MV-168
  --      measured this three times, and MV-182's own header would have told a reader to drop it.
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
    raise exception 'MV-185: documents_case_kind_idx is gone, no longer UNIQUE, or has become '
      'PARTIAL. supabase-js compiles `.upsert()` to `INSERT … ON CONFLICT DO UPDATE` and the '
      'arbiter index must exist and be FULL — every upsert on the vault now fails at plan time. '
      'Spec §2 (2026-08-20-case-document-collaboration.md) is why this file must not touch it.';
  end if;
end $$;
