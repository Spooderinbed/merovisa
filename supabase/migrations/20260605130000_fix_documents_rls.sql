-- Tighten documents RLS: INSERT must be service_role only.
-- Without `to service_role`, the existing policy allowed any authenticated
-- user to write a documents row with an arbitrary owner UUID via the anon
-- client. Mirror the assessments/profiles pattern.

drop policy if exists "Service inserts documents" on public.documents;

create policy "Service inserts documents"
  on public.documents for insert
  to service_role
  with check (true);

alter table public.documents force row level security;

revoke all on public.documents from anon, authenticated;
grant select, delete on public.documents to authenticated;

-- Same hardening for storage.objects in the documents bucket.
drop policy if exists "Service uploads document files" on storage.objects;

create policy "Service uploads document files"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'documents');
