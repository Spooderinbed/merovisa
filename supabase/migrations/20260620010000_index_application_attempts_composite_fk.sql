-- MV-08 follow-up — cover the application_attempts composite FK (prediction_id, owner).
--
-- The base migration (20260620000000_add_outcome_validation.sql) indexed
-- prediction_id and owner SEPARATELY, but the composite FK
--   (prediction_id, owner) -> program_predictions (id, owner)
-- needs a single covering index on (prediction_id, owner) or the performance
-- linter flags it as an unindexed foreign key. This mirrors the
-- (attempt_id, owner) composite index already on outcome_events (S11).
--
-- The standalone (prediction_id) index becomes redundant once the composite
-- exists — the composite covers prediction_id-leading lookups too — so it is
-- dropped. (owner) and (program_id) indexes are retained: they cover the FKs to
-- auth.users and programs respectively.
create index application_attempts_prediction_id_owner_idx
  on public.application_attempts (prediction_id, owner);

drop index public.application_attempts_prediction_id_idx;
