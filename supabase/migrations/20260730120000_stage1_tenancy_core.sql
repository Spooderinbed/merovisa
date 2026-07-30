-- MV-150 — Stage 1 tenancy core schema (consultancy / student case workspace).
-- Plan: docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md
--       §"New core tables" · §"Invitations and account linking" · §"Activity history and security audit"
-- Card: docs/kanban/cards/MV-150-tenancy-core-schema.md
--
-- Six new tables in `public`, forming the tenancy spine:
--   organizations            the consultancy tenant
--   organization_memberships staff ↔ org, with the role/status a policy predicate reads
--   cases                    the unit of the MeroVisa experience (org case or personal case)
--   case_assignments         counsellor ↔ case (assigned-only access)
--   invitations              hash-only, single-acceptance team/student invites
--   audit_events             append-only security evidence
--
-- STRICTLY ADDITIVE. This migration touches NO existing table: no ALTER, no owner-column
-- relaxation, no composite-FK rebuild, no `case_id` anywhere, no change to the
-- program_predictions immutability trigger, and no data — every one of those is Stage 2
-- (plan §"Known schema obstacles" / "Additive migration sequence" steps 2-13). Inert on
-- apply: no request path writes these tables yet, mirroring 20260620000000.
--
-- SHIPPED LOCKED SHUT. RLS is enabled AND forced on all six tables, the only policies are
-- explicit named deny-all (`using (false)`), and all grants are revoked from anon and
-- authenticated. Nothing can read or write these tables from a client until MV-152 drops
-- the deny-all policies and lands real case-aware policies + a reviewed grant set. That
-- keeps the window between "tables exist" and "policies exist" closed by construction
-- rather than by nobody having written a query yet.
--
-- Conventions inherited from 20260620000000_add_outcome_validation.sql (owner/actor FKs,
-- enable+force RLS, explicit revoke, role-independent immutability trigger), 20260603170655
-- (private schema + private.set_updated_at, partial-unique idiom) and 20260618120000
-- (advisor discipline: pinned `search_path`, every FK covered by an index).
--
-- Enums are `text … check (… in (…))` — house convention, no native pg enums.

-- =====================================================================
-- 1  organizations — the consultancy tenant
-- =====================================================================
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,                    -- URL identity; unique index also serves lookups
  status     text not null default 'active' check (status in ('active','suspended')),
  created_by uuid references auth.users(id) on delete set null,  -- SET NULL: losing the creator's
                                                                 -- Auth account must not delete a tenant
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_created_by_idx on public.organizations (created_by);  -- FK cover

-- =====================================================================
-- 2  organization_memberships — staff ↔ org
-- =====================================================================
-- `role` deliberately excludes 'student': students are not org members, they attach to a
-- single case through cases.student_user_id. `status='inactive'` is the revocation switch —
-- MV-152's membership predicate reads it, so a revoked member loses access immediately
-- without the row being deleted (the audit trail needs the row to survive).
create table public.organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id)           on delete cascade,
  role            text not null check (role in ('owner','admin','counsellor')),
  status          text not null default 'active' check (status in ('active','inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)   -- one membership per person per org; also the
                                      -- organization_id FK's covering index (leading column)
);
-- "which orgs is this actor in" — the MV-152 helper's entry point, and the user_id FK cover.
create index organization_memberships_user_id_idx
  on public.organization_memberships (user_id);
-- "the active members of this org" — keeps `status` available to the predicate without a
-- second lookup. organization_id is already covered by the unique constraint above, so no
-- redundant single-column index is created (see the index-coverage note at the foot).
create index organization_memberships_organization_id_status_idx
  on public.organization_memberships (organization_id, status);

-- =====================================================================
-- 3  cases — the unit of the MeroVisa experience
-- =====================================================================
-- organization_id nullable  = a personal case (an individual student using MeroVisa directly).
-- student_user_id nullable  = not yet claimed. ON DELETE SET NULL, never cascade: a student
--   deleting their Auth account must not destroy the consultancy's case record.
-- An unclaimed case is identifiable as `student_user_id is null` and is dated by created_at,
--   which keeps the door open for the retention/purge rule that is still a founder decision
--   (MV-149 carried design input; docs/data-retention-policy.md pattern). Nothing here sets
--   a window or purges anything.
-- created_at also anchors the (unset) case-creation → student-notice window; enforcing that
--   window is invitation/notice-layer work in a later stage, not schema.
create table public.cases (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  student_user_id    uuid references auth.users(id)           on delete set null,
  display_name       text not null,
  email              text,                            -- inert until Stage 3 (legal gate, D-B):
                                                       -- no real student data in Stage 1
  operational_status text not null default 'new' check (operational_status in (
                       'new','in_progress','waiting_on_student','ready_for_review','closed')),
  created_by         uuid references auth.users(id) on delete set null,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index cases_organization_id_idx on public.cases (organization_id);  -- org-scope predicate + FK
create index cases_student_user_id_idx on public.cases (student_user_id);  -- student-link predicate + FK
create index cases_created_by_idx      on public.cases (created_by);       -- FK cover

-- =====================================================================
-- 4  case_assignments — counsellor ↔ case
-- =====================================================================
-- assignment_role is a one-value check today ('primary_counsellor'); the column exists so
-- adding 'reviewer' etc. later is a check change, not a table change.
create table public.case_assignments (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.cases(id)  on delete cascade,
  user_id         uuid not null references auth.users(id)    on delete cascade,
  assignment_role text not null check (assignment_role in ('primary_counsellor')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (case_id, user_id)   -- one assignment row per person per case; also the case_id
                              -- FK's covering index (leading column)
);
-- "which cases is this counsellor assigned to" — the assigned-only predicate + user_id FK cover.
create index case_assignments_user_id_idx on public.case_assignments (user_id);
-- At most one primary counsellor per case, enforced by the database rather than by the app
-- (mirrors assessments_primary_idx in 20260603170655).
create unique index case_assignments_primary_idx
  on public.case_assignments (case_id)
  where assignment_role = 'primary_counsellor';

-- =====================================================================
-- 5  invitations — hash-only, single-acceptance
-- =====================================================================
-- The raw token is NEVER stored: the app hashes it and stores only token_hash, so a database
-- read cannot yield a usable credential. `unique (token_hash)` is what makes the atomic
-- compare-and-swap acceptance enforceable — one statement setting accepted_at where the hash
-- matches AND accepted_at is null AND revoked_at is null AND expires_at > now(), with the
-- affected row count deciding success. That statement is Stage 5 app code; MV-150 ships only
-- the columns and the uniqueness it needs.
-- Two shapes, mutually exclusive by case_id nullness (so the OR below is a true XOR):
--   team invite    -> organization_id set, case_id null, role is a staff role
--   student invite -> case_id set, role = 'student'
-- email is stored as given; normalized-address matching at acceptance time is Stage 5.
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  case_id         uuid references public.cases(id)         on delete cascade,
  email           text not null,
  role            text not null check (role in ('owner','admin','counsellor','student')),
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  invited_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint invitations_shape_check check (
    (organization_id is not null and case_id is null and role <> 'student')
    or (case_id is not null and role = 'student')
  )
);
create index invitations_organization_id_idx on public.invitations (organization_id);  -- FK cover
create index invitations_case_id_idx         on public.invitations (case_id);           -- FK cover
create index invitations_invited_by_idx      on public.invitations (invited_by);         -- FK cover
create index invitations_email_idx           on public.invitations (email);              -- "invites for
                                                                                          -- this address"

-- =====================================================================
-- 6  audit_events — append-only security evidence
-- =====================================================================
-- organization_id / case_id / actor_user_id are BARE uuid WITH NO FOREIGN KEY. This is a
-- deliberate fork from house style, not an oversight:
--   * `on delete set null` would fire a system UPDATE on the audit row when a parent org,
--     case, or user is deleted. The append-only BEFORE UPDATE trigger below would raise, and
--     the parent delete would fail — deleting an organization would become impossible.
--   * `on delete cascade` would erase the history of exactly the event most worth keeping.
-- Bare uuid + an index gives a tombstone that outlives its subjects with its identifiers
-- intact, and never fights the immutability trigger. Referential integrity for these columns
-- is the writer's responsibility (private.write_audit_event, below).
--
-- No updated_at column: an audit row is written once and never modified.
-- metadata holds SAFE metadata only — no document content, no passport numbers, no raw
-- student detail (plan §"New core tables", closing line).
create table public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,
  case_id         uuid,
  actor_user_id   uuid,
  action          text not null,
  entity_type     text,
  entity_id       text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index audit_events_organization_id_idx on public.audit_events (organization_id);
create index audit_events_case_id_idx         on public.audit_events (case_id);
create index audit_events_actor_user_id_idx   on public.audit_events (actor_user_id);
create index audit_events_created_at_idx      on public.audit_events (created_at);

-- Append-only enforced as a DATABASE property, not a convention (plan §"Activity history and
-- security audit"). Revoking UPDATE is not sufficient: service_role bypasses RLS and holds
-- its own grants, so a bug on a privileged path could rewrite history. A role-independent
-- BEFORE UPDATE guard raises for every role including service_role, exactly as
-- private.reject_prediction_update does for program_predictions.
-- DELETE is intentionally left open to privileged roles for the future retention / tombstone
-- path (Stage 6), matching the program_predictions precedent; no client role holds it.
create function private.reject_audit_event_update()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only (no UPDATE permitted)';
end;
$$;
create trigger audit_events_no_update
  before update on public.audit_events
  for each row execute function private.reject_audit_event_update();

-- The single write choke point. Sensitive reads and the audit row that records them must not
-- be separable, so writes flow through one function rather than scattered inserts.
-- SECURITY DEFINER with a pinned empty search_path (advisor function_search_path_mutable).
-- Deliberately INERT in Stage 1: it lives in `private` (not exposed via the API) and EXECUTE
-- is revoked from public, so nothing can call it until MV-152's grant review decides who may.
create function private.write_audit_event(
  p_action          text,
  p_organization_id uuid  default null,
  p_case_id         uuid  default null,
  p_actor_user_id   uuid  default null,
  p_entity_type     text  default null,
  p_entity_id       text  default null,
  p_metadata        jsonb default '{}'::jsonb
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_action is null or p_action = '' then
    raise exception 'write_audit_event requires an action';
  end if;

  insert into public.audit_events (
    organization_id, case_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    p_organization_id, p_case_id, p_actor_user_id, p_action, p_entity_type, p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function private.write_audit_event(text, uuid, uuid, uuid, text, text, jsonb)
  from public;

-- =====================================================================
-- 7  updated_at triggers (the five mutable tables; audit_events is immutable)
-- =====================================================================
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger organization_memberships_set_updated_at
  before update on public.organization_memberships
  for each row execute function private.set_updated_at();
create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function private.set_updated_at();
create trigger case_assignments_set_updated_at
  before update on public.case_assignments
  for each row execute function private.set_updated_at();
create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function private.set_updated_at();

-- =====================================================================
-- 8  RLS: enabled, FORCED, deny-all
-- =====================================================================
-- `force` matters as much as `enable`: without it the table owner is exempt, and these tables
-- are created by the migration role. MV-153 asserts relforcerowsecurity per table rather than
-- trusting this DDL by eye.
alter table public.organizations            enable row level security;
alter table public.organizations            force  row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_memberships force  row level security;
alter table public.cases                    enable row level security;
alter table public.cases                    force  row level security;
alter table public.case_assignments         enable row level security;
alter table public.case_assignments         force  row level security;
alter table public.invitations              enable row level security;
alter table public.invitations              force  row level security;
alter table public.audit_events             enable row level security;
alter table public.audit_events             force  row level security;

-- RLS with no policy is already deny-all (the `public.leads` precedent, 20260618120000).
-- These tables get NAMED deny-all policies anyway, so the locked state is greppable and
-- provably intentional: a reviewer can see Stage 1 refused access on purpose, and MV-153 can
-- assert the policy exists. MV-152 drops these five-plus-one policies and replaces them with
-- real case-aware policies — a clean "drop deny-all, add real" seam.
create policy organizations_deny_all on public.organizations
  for all to anon, authenticated using (false) with check (false);
create policy organization_memberships_deny_all on public.organization_memberships
  for all to anon, authenticated using (false) with check (false);
create policy cases_deny_all on public.cases
  for all to anon, authenticated using (false) with check (false);
create policy case_assignments_deny_all on public.case_assignments
  for all to anon, authenticated using (false) with check (false);
create policy invitations_deny_all on public.invitations
  for all to anon, authenticated using (false) with check (false);
create policy audit_events_deny_all on public.audit_events
  for all to anon, authenticated using (false) with check (false);

-- Belt and braces: no client role holds any privilege on any of the six in Stage 1, so even
-- a policy mistake cannot open a door. Granting the reviewed set (authenticated only; anon
-- nothing) is MV-152's job.
revoke all on public.organizations, public.organization_memberships, public.cases,
              public.case_assignments, public.invitations, public.audit_events
  from anon, authenticated;

-- =====================================================================
-- Index coverage note (MV-150 acceptance: every FK column and every column a Stage-1 RLS
-- predicate reads is indexed — advisor unindexed_foreign_keys clean)
-- =====================================================================
--   organizations.created_by                  organizations_created_by_idx
--   organizations.slug                        unique constraint
--   organization_memberships.organization_id  unique (organization_id, user_id) [leading col]
--                                             + organization_memberships_organization_id_status_idx
--   organization_memberships.user_id          organization_memberships_user_id_idx
--   organization_memberships.status           organization_memberships_organization_id_status_idx
--   cases.organization_id                     cases_organization_id_idx
--   cases.student_user_id                     cases_student_user_id_idx
--   cases.created_by                          cases_created_by_idx
--   case_assignments.case_id                  unique (case_id, user_id) [leading col]
--                                             + case_assignments_primary_idx (partial)
--   case_assignments.user_id                  case_assignments_user_id_idx
--   invitations.organization_id               invitations_organization_id_idx
--   invitations.case_id                       invitations_case_id_idx
--   invitations.invited_by                    invitations_invited_by_idx
--   invitations.email                         invitations_email_idx
--   invitations.token_hash                    unique constraint
--   audit_events.organization_id/case_id/actor_user_id/created_at   one index each
--
-- No redundant single-column index is created where a unique constraint's leading column
-- already covers the foreign key (organization_memberships.organization_id,
-- case_assignments.case_id) — the advisor's unindexed_foreign_keys check is satisfied by a
-- prefix match, and a duplicate would only cost write amplification. MV-152 adds whatever
-- partial or covering tuning its final helper predicates need.
