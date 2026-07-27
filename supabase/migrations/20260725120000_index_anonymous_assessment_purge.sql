-- MV-135 (audit O-2) — support the daily unclaimed-anonymous-assessment purge.
--
-- The purge scans `owner is null and expires_at < now() and created_at < cutoff`
-- (lib/assessments/purge.ts) once a day, forever. Without an index that is a full scan
-- of a table whose rows carry large profile/result JSONB.
--
-- Partial on `owner is null`, so the index only ever contains anonymous rows — and since
-- those are deleted within days of creation, it stays small permanently while the owned
-- rows it excludes grow. `created_at` leads because it is the database-set column the
-- purge's outer bound uses.
--
-- Additive and non-destructive: an index only, no data or policy change.
create index if not exists assessments_anon_purge_idx
  on public.assessments (created_at)
  where owner is null;
