# `supabase/rehearsal/`

Scripts that are **not migrations**. Nothing here is applied by `supabase db push`; nothing here has
a row in `supabase_migrations.schema_migrations`. They exist because Stage 2 is the first work in
this repo that **mutates live user data**, and the reversibility doctrine
(`docs/kanban/cards/MV-154-stage2-umbrella.md`) requires that a rollback be *executed* in a
rehearsal rather than merely written: a written rollback that was never run is a hypothesis.

## Files

| File | What it is |
|---|---|
| `MV-155-rollback.sql` | The MV-155 unwind, ordered per the Stage 2 matrix spec §10.1 **R6**. Fail-closed: refuses to run once MV-156 has applied, and refuses to blanket-delete personal cases without an explicit `-v mv157_merged=no`. |
| `MV-155-rehearsal-corpus.sql` | A **production-shaped** corpus reproducing the live inventory captured 2026-08-02 (spec §2.9). A stand-in for the founder-gated dump, not a substitute for it — see below. |
| `MV-155-counts.sql` | The before/after snapshot: per-table row counts, `case_id` fill, the reconciliation call, and the column-grant surface. Runs unchanged against the pre-migration, post-migration and post-rollback states. |

## Running the MV-155 rehearsal

Everything below is **local only**. `MV-155-rehearsal-corpus.sql` writes directly to `auth.users`
and `MV-155-rollback.sql` drops columns from every student-owned table; neither may be pointed at a
hosted project. The agent session that authored these does not hold production credentials and did
not touch the hosted project — applying MV-155 to `obfvrxixtautamflzxzq` is a separate,
founder-approved action that happens **after** this record exists.

```bash
PSQL="docker exec -i supabase_db_merovisa psql -U postgres -d postgres -v ON_ERROR_STOP=1"
```

1. **Pin the stack at the predecessor state.** Move
   `supabase/migrations/20260802120000_stage2_case_id_and_personal_cases.sql` aside, run
   `npx supabase db reset`, and confirm `max(version) = 20260730180000`. MV-155's rollback is valid
   only against this state.
2. **Restore the data.** Either `$PSQL < supabase/rehearsal/MV-155-rehearsal-corpus.sql`, or — when
   the founder has produced one — restore the real `supabase db dump --data-only` in its place.
   Every later step is identical either way; that is the point of having the corpus.
3. **BEFORE:** `$PSQL -tAX < supabase/rehearsal/MV-155-counts.sql`.
4. **Apply MV-155 alone**, in one transaction, and time it. Move the migration back, then
   `$PSQL --single-transaction < supabase/migrations/20260802120000_*.sql`. The `raise notice`
   carrying the backfill report is the primary artifact.
5. **AFTER:** the same counts script. Per-table row counts must be **identical** to step 3 — the
   backfill only ever `UPDATE`s — and `mv155_assert_case_backfill()` must report `CLEAN`.
6. **Run the integration lane against the restored copy**: `npm run test:integration`.
7. **Execute the rollback**, both ways: once with no `-v` (it must REFUSE), then
   `$PSQL -v mv157_merged=no < supabase/rehearsal/MV-155-rollback.sql`. Re-run the counts script:
   `case_id` reads `no column` on all nine and the row counts still match step 3.
8. **Re-apply** step 4. The report must be identical to the first apply. Roll forward, roll back,
   roll forward again — a rollback tested in only one direction has not been tested.

## Why the corpus exists, and what it does not prove

The card asks for a rehearsal against "a restored copy of live data". That dump is founder-gated:
it needs production credentials, and an agent session must not attempt it. Rather than skip the
rehearsal or claim one that did not happen, the corpus reproduces the **shapes and counts** of the
2026-08-02 capture — 9 Auth users, 7 profiles, 36 owned assessments (31 claimed), 74 plan items, 12
program-state rows, 6 documents across 3 users, 0 `document_status`, 10 predictions, 10 attempts, 19
outcome events — plus every constraint-loading shape the counts alone would miss.

**It does not prove anything about the real `result` / `profile_snapshot` / `sections` payloads**,
which is exactly what a dump would add and the reason the founder-gated rehearsal still has to
happen before the production apply. Re-run this same sequence against the dump; the only file that
changes is step 2.

One departure is deliberate and is the whole reason the corpus is not "counts only": production has
**zero** anonymous assessments (MV-135's purge cleared them; the population is transient under a
3-day TTL — spec §9.6), so live-shaped data cannot exercise "anonymous rows stay case-less" at all.
The corpus seeds one anonymous row on top of the 36 so the branch is entered. A rehearsal log that
reads `0 anonymous rows left case-less` is evidence the branch was never reached, not evidence it
works — read it that way.
