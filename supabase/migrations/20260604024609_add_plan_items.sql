create table public.plan_items (
  id              bigint generated always as identity primary key,
  owner           uuid not null references auth.users(id) on delete cascade,
  kind            text not null,
  impact          text not null check (impact in ('high','medium','low')),
  title           text not null,
  body            text,
  lift_estimate   text,
  time_estimate   text,
  status          text not null default 'todo' check (status in ('todo','done','dismissed')),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index plan_items_owner_idx on public.plan_items (owner);
create index plan_items_open_idx  on public.plan_items (owner, created_at desc) where status = 'todo';

create unique index plan_items_kind_open_idx on public.plan_items (owner, kind) where status = 'todo';

alter table public.plan_items enable row level security;
alter table public.plan_items force  row level security;

create policy plan_items_select_own on public.plan_items
  for select to authenticated using ((select auth.uid()) = owner);

create policy plan_items_update_own on public.plan_items
  for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

-- INSERT and DELETE via service role only — generator owns lifecycle
revoke all on public.plan_items from anon, authenticated;
grant select, update on public.plan_items to authenticated;
