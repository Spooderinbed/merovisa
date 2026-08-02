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
   carrying the backfill report is the primary artifact — **capture it verbatim, including the
   `personal_case_ids` array** (see step 4a below and the production section, where it is mandatory).

   **4a. Keep the `personal_case_ids` array.** The report looks like:

   ```
   NOTICE:  MV-155 backfill report: {"cases_created": 9,
            "personal_case_ids": ["7b1f…", "9c02…", …], "profiles": 7, …}
   ```

   That array is the **only** record of which cases this apply minted, and it is the input
   `MV-155-rollback.sql` requires on its non-destructive path once MV-157 has merged. Nothing
   reconstructs it afterwards: `created_by`, `student_user_id`, `operational_status` and
   `organization_id` all take values a real MV-157 signup also takes, and the inserts do not go
   through `private.write_audit_event`. Losing it does not make the rollback harder — it removes
   that path.
5. **AFTER:** the same counts script. Per-table row counts must be **identical** to step 3 — the
   backfill only ever `UPDATE`s — and `mv155_assert_case_backfill()` must report `CLEAN`.
6. **Run the integration lane against the restored copy**: `npm run test:integration`.
7. **Execute the rollback**, both ways: once with no `-v` (it must REFUSE), then
   `$PSQL -v mv157_merged=no < supabase/rehearsal/MV-155-rollback.sql`. Re-run the counts script:
   `case_id` reads `no column` on all nine and the row counts still match step 3.
8. **Re-apply** step 4. The report must be identical to the first apply. Roll forward, roll back,
   roll forward again — a rollback tested in only one direction has not been tested.

## Applying MV-155 to production

**Founder-gated. Nothing in this section is an agent action.** It is here because the rehearsal above
is only meaningful if the production apply has the same all-or-nothing property, and until this
section existed nothing in the PR said what that path was or asserted it was atomic.

### The command

```bash
npx supabase link --project-ref obfvrxixtautamflzxzq   # once
npx supabase db push
```

### Why that is atomic — measured, not assumed

`supabase db push` submits each migration file to Postgres as **one multi-statement simple query**,
which Postgres executes as a single **implicit transaction**. Every statement commits or none does,
and the `supabase_migrations.schema_migrations` row is written inside the same unit. Verified against
this repo's pinned CLI (**2.107.0**) by pushing a deliberately failing migration
(`create table a; create table b; select 1/0;`) at a scratch database:

| file contents | result |
|---|---|
| no `begin;`/`commit;` | **both tables rolled back**, no `schema_migrations` row — all-or-nothing holds |
| with `begin;`/`commit;` | the pre-`commit` table **SURVIVED** the later failure, and still no `schema_migrations` row — a half-applied schema the migration history does not know about |

**This is why the migration file carries no `begin;`/`commit;`,** matching all 19 predecessors.
Adding them is not a belt-and-braces improvement — the second row of that table is exactly the
silent half-migration this card exists to prevent, because the inner `commit` ends the CLI's own
implicit transaction early.

A cosmetic artifact of the same mechanism: `set local …` inside a migration emits
`WARNING (25P01): SET LOCAL can only be used in transaction blocks`, because an *implicit*
transaction is not an explicit "transaction block" for that check even though the setting does take
effect. The migration therefore uses a plain `set lock_timeout` with a matching `reset` at the foot
of the file, so no warning fires on a legitimate apply.

### If a different path is ever used

The only acceptable alternative is an explicit single transaction, and the operator then owes the
bookkeeping row by hand:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f supabase/migrations/20260802120000_stage2_case_id_and_personal_cases.sql
psql "$DATABASE_URL" -c "insert into supabase_migrations.schema_migrations (version) \
  values ('20260802120000');"
```

Applying it statement-by-statement — a SQL editor, a paste into Studio, `psql` **without**
`--single-transaction` — is **not acceptable**. Stopping partway leaves `case_id` on nine tables all
NULL, thirteen new indexes, the narrowed prediction guard live and the grants rewritten, with the app
still working and nothing surfacing it until a later slice trips over it.

### Verify the apply was COMPLETE, not merely error-free

Atomicity means a failure leaves nothing behind; it does not by itself prove the operator ran the
whole file. Immediately after the push, run the counts script — it **asserts** rather than prints,
and raises if the apply is partial in any of six ways:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/rehearsal/MV-155-counts.sql
```

It must end with `MV-155 apply verification: COMPLETE`. Anything else — including a raised
exception — means **do not proceed**; investigate before any Stage 2 slice is merged.

Then record, on the card: the captured `personal_case_ids` array, the counts script's output, and the
wall clock.

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
