-- Waiting state for self-reported plan items ("mark as in progress").
-- status stays 'todo' so the partial unique index and every open-item query
-- keep working; started_at IS NOT NULL = removed from next-step selection.
alter table public.plan_items add column started_at timestamptz;
