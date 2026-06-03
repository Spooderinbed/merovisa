create table public.assessments (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid references auth.users(id) on delete cascade,
  profile      jsonb       not null,
  result       jsonb       not null,
  rule_version text        not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  claimed_at   timestamptz
);
create index assessments_owner_idx on public.assessments (owner) where owner is not null;

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid references public.assessments(id) on delete cascade,
  email         text        not null,
  consent_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint leads_assessment_email_uniq unique (assessment_id, email)
);
create index leads_assessment_id_idx on public.leads (assessment_id);

alter table public.assessments enable row level security;
alter table public.leads        enable row level security;
alter table public.assessments force row level security;
alter table public.leads        force row level security;

create policy assessments_select_own
  on public.assessments
  for select
  to authenticated
  using ((select auth.uid()) = owner);

revoke all on public.assessments from anon;
revoke all on public.assessments from authenticated;
grant  select on public.assessments to authenticated;
revoke all on public.leads from anon, authenticated;
