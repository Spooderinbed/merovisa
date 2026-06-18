-- Harden Supabase advisor findings flagged by the 2026-06-18 DB audit.
-- All changes are idempotent and reversible; no data is touched.

-- 1. SECURITY (function_search_path_mutable): pin the search_path on the shared
--    updated_at trigger function (it inherited the caller's search_path).
create or replace function private.set_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. PERFORMANCE (unindexed_foreign_keys): cover the
--    user_program_state.program_id -> programs(id) foreign key.
create index if not exists user_program_state_program_id_idx
  on public.user_program_state (program_id);

-- 3. PERFORMANCE (auth_rls_initplan): the documents SELECT/DELETE policies
--    re-evaluated auth.uid() per row. Wrap it in a scalar subselect so Postgres
--    evaluates it once per query. Definitions are otherwise byte-for-byte the
--    same (roles: public; qual: auth.uid() = owner).
drop policy if exists "Users read own documents" on public.documents;
create policy "Users read own documents" on public.documents
  for select using (((select auth.uid()) = owner));

drop policy if exists "Users delete own documents" on public.documents;
create policy "Users delete own documents" on public.documents
  for delete using (((select auth.uid()) = owner));

-- NOTES (not expressible as SQL here):
--  - `public.leads` has RLS enabled with no policy ON PURPOSE: it is written only
--    via the service-role admin client, so all client roles correctly see nothing.
--    Documented to make the advisor INFO an intentional, reviewed decision.
--  - Auth "leaked password protection" (HaveIBeenPwned) is an Auth config toggle,
--    not SQL. Enable it in the Supabase dashboard (Auth > Policies) before public
--    traffic. Tracked as a manual ops step.
