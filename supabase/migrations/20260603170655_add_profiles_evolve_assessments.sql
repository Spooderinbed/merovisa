-- profiles table
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null unique references auth.users(id) on delete cascade,
  sections     jsonb not null default '{}'::jsonb,
  completeness int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index profiles_owner_idx on public.profiles (owner);

-- private schema + updated_at trigger
create schema if not exists private;

create or replace function private.set_updated_at()
  returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- RLS on profiles
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = owner);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;

-- evolve assessments
alter table public.assessments
  add column destination_id   text,
  add column is_primary       boolean not null default false,
  add column profile_snapshot jsonb;

update public.assessments
  set profile_snapshot = profile
  where profile_snapshot is null;

update public.assessments
  set destination_id = coalesce(profile_snapshot->>'destination', 'australia')
  where destination_id is null;

alter table public.assessments
  alter column destination_id   set not null,
  alter column profile_snapshot set not null,
  drop column profile;

-- at-most-one-primary per owner
create unique index assessments_primary_idx on public.assessments (owner) where is_primary;
