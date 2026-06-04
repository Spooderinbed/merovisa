-- Documents table
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in (
    'passport','birth-certificate','national-id',
    'slc-see','plus-two','bachelors-transcript','masters-transcript',
    'ielts','pte','toefl',
    'bank-statement','loan-sanction','sponsor-income',
    'employment-letter','salary-slip',
    'offer-letter','coe','oshc','medical','other'
  )),
  file_path      text not null,
  file_size      integer not null,
  original_name  text not null,
  extracted_data jsonb,
  profile_section text,
  status         text not null default 'processing'
                 check (status in ('processing','extracted','failed','stored')),
  created_at     timestamptz not null default now(),
  unique (owner, kind)
);

-- RLS
alter table public.documents enable row level security;

create policy "Users read own documents"
  on public.documents for select
  using (auth.uid() = owner);

create policy "Users delete own documents"
  on public.documents for delete
  using (auth.uid() = owner);

create policy "Service inserts documents"
  on public.documents for insert
  with check (true);

-- Index
create index documents_owner_idx on public.documents (owner);

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Storage policies: users access only their own folder
create policy "Users read own document files"
  on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete own document files"
  on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Service uploads document files"
  on storage.objects for insert
  with check (bucket_id = 'documents');
