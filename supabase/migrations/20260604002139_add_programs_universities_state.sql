-- universities
create table public.universities (
  id              text primary key,
  country         text not null,
  name            text not null,
  city            text not null,
  ranking_tier    int  not null check (ranking_tier between 1 and 3),
  source          text,
  last_verified   date,
  data_quality    text not null default 'primary' check (data_quality in ('primary','derived','secondary')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger universities_set_updated_at
  before update on public.universities for each row execute function private.set_updated_at();

-- programs
create table public.programs (
  id                text primary key,
  university_id     text not null references public.universities(id) on delete cascade,
  name              text not null,
  level             text not null check (level in ('bachelors','masters','doctorate')),
  field             text not null,
  tuition_min       numeric(12,2),
  tuition_max       numeric(12,2),
  tuition_currency  text not null default 'AUD',
  min_grade         int,
  min_english       numeric(3,1),
  min_english_band  numeric(3,1),
  intakes           text[] not null default '{}',
  source            text,
  last_verified     date,
  data_quality      text not null default 'derived' check (data_quality in ('primary','derived','secondary')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index programs_university_id_idx on public.programs (university_id);
create index programs_field_idx          on public.programs (field);
create index programs_level_idx          on public.programs (level);
create trigger programs_set_updated_at
  before update on public.programs for each row execute function private.set_updated_at();

-- user_program_state
create table public.user_program_state (
  owner       uuid not null references auth.users(id) on delete cascade,
  program_id  text not null references public.programs(id) on delete cascade,
  status      text not null check (status in ('shortlisted','applied','withdrawn')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (owner, program_id)
);
create index user_program_state_owner_idx on public.user_program_state (owner);
create trigger user_program_state_set_updated_at
  before update on public.user_program_state for each row execute function private.set_updated_at();

-- RLS
alter table public.universities      enable row level security;
alter table public.universities      force  row level security;
alter table public.programs          enable row level security;
alter table public.programs          force  row level security;
alter table public.user_program_state enable row level security;
alter table public.user_program_state force  row level security;

create policy universities_read on public.universities for select to authenticated using (true);
create policy programs_read     on public.programs     for select to authenticated using (true);

create policy ups_select_own on public.user_program_state
  for select to authenticated using ((select auth.uid()) = owner);
create policy ups_insert_own on public.user_program_state
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy ups_update_own on public.user_program_state
  for update to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy ups_delete_own on public.user_program_state
  for delete to authenticated using ((select auth.uid()) = owner);

revoke all on public.universities      from anon, authenticated;
revoke all on public.programs          from anon, authenticated;
revoke all on public.user_program_state from anon, authenticated;
grant select               on public.universities      to authenticated;
grant select               on public.programs          to authenticated;
grant select, insert, update, delete on public.user_program_state to authenticated;
