-- MV-53 — Global document checklist: per-user "obtained" status, independent of uploads.
--
-- A signed-in user needs one program-agnostic checklist where they can mark each
-- document kind as "obtained" — whether or not they've uploaded a file for it. The
-- `documents` table can't carry this: file_path/file_size are NOT NULL, so an
-- "obtained but not uploaded" state has no row there. This orthogonal table keys
-- (owner, kind) with a boolean and leaves `documents` + the per-program checklist
-- generator (lib/checklist/generator.ts, which derives "have" from uploaded kinds)
-- completely untouched (Option B, Codex-concurred 2026-06-26).
--
-- USER-owned toggle via the RLS client (authenticated, NOT service_role) — mirrors
-- the owner-scoped policy idiom in 20260620000000_add_outcome_validation.sql
-- (per-op policies, force RLS, explicit revoke/grant). No backfill: rows exist only
-- where the user has explicitly toggled "obtained"; absence means not-obtained.
--
-- The kind check list is the EXACT DOCUMENT_KINDS array from lib/documents/types.ts
-- (the single source of truth shared with the Zod enum) — keep them in lockstep.

create table public.document_status (
  owner       uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in (
                'passport','birth-certificate','national-id',
                'slc-see','plus-two','bachelors-transcript','masters-transcript',
                'ielts','pte','toefl',
                'bank-statement','loan-sanction','sponsor-income',
                'employment-letter','salary-slip',
                'offer-letter','coe','oshc','medical','other')),
  obtained    boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (owner, kind)
);
create index document_status_owner_idx on public.document_status (owner);

-- RLS: owner-scoped, authenticated-only. The UPDATE policy carries BOTH using and
-- with check so an upsert-on-conflict update (toggling an existing row) is allowed
-- in either direction without leaving the owner's scope.
alter table public.document_status enable row level security;
alter table public.document_status force  row level security;

create policy ds_select_own on public.document_status
  for select to authenticated using ((select auth.uid()) = owner);
create policy ds_insert_own on public.document_status
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy ds_update_own on public.document_status
  for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);
create policy ds_delete_own on public.document_status
  for delete to authenticated using ((select auth.uid()) = owner);

revoke all on public.document_status from anon, authenticated;
grant select, insert, update, delete on public.document_status to authenticated;
