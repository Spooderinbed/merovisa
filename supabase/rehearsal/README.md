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
| `MV-155-rehearsal-corpus.sql` | A **production-shaped** corpus reproducing the live inventory captured 2026-08-02 (spec §2.9). A stand-in for the founder-gated dump, not a substitute for it — see below. Shared by both slices' rehearsals. |
| `MV-155-counts.sql` | The before/after snapshot: per-table row counts, `case_id` fill, the reconciliation call, and the column-grant surface. Runs unchanged against the pre-migration, post-migration and post-rollback states. |
| `MV-156-rollback.sql` | The MV-156 unwind, ordered per spec §10.1 **R5**. Fail-closed with four guards; needs **no** `-v` flag, because every one of its expiries is a fact about the database rather than about the codebase. |
| `MV-156-counts.sql` | MV-156's DATA fingerprint — row counts, both ownership axes, whole-row and `updated_at` md5s, and row identity. Must be **byte-identical at every capture point**, because MV-156 writes no row data. |
| `MV-159-rollback.sql` | The MV-159 unwind, ordered per spec §10.1 **R2**: drop the 24 case-aware policies, re-apply the legacy owner set verbatim, then drop the five helpers (**five since MV-159 review round 3** — `case_student_id`, the OWNER-axis helper the five INSERT `WITH CHECK`s and §1b clause (c) share). One transaction — a table with RLS FORCED and zero policies returns zero rows to every client. Four guards; no `-v` flag; no point of no return. Guard 2 keys on the **hazard** (`owner IS NULL` case-bearing rows exist) rather than on its usual cause (MV-160 applied), and the closing block **fingerprints the restored catalogue** against the measured pre-MV-159 state, so "it ran" and "it restored" are separate claims. |
| `MV-159-visibility.sql` | MV-159's rehearsal, and it is a different SHAPE from the two above because the card mutates no data. It captures the set of row ids **visible as each authenticated user AND as `anon`** on each of the nine tables, applies the migration inline, re-captures, and RAISES on any diff, on any widening, and on any pair reachable only through the transitional owner disjunct. Rolls itself back. Applies the migration with `\ir`, so it must be run **by path**, not on stdin — see step 4. |
| `MV-168-rollback.sql` | The MV-168 unwind — the three Stage 3 write grants and their three policies, leaving MV-160's end state. Policies dropped **before** grants, both in one transaction, because a granted verb with no policy is an *unfiltered* verb. Guard 0 refuses a partially-applied MV-168; four restored-state assertions including an over-revoke check that Stage 2's five UPDATE grants survived. Unwinds FIRST in the chain — see "Rolling MV-168 back in production". |
| `MV-156-catalog.sql` | MV-156's SCHEMA capture — columns (with ordinals), constraints, indexes, triggers, column grants and policies for the **nine** student-owned tables. The pre-apply capture vs the post-rollback capture is what turns "the rollback ran" into "the rollback restored". **Widened from eight to nine on 2026-08-03** so it covers `assessments`: MV-156's "`assessments` is untouched" criterion was not something an eight-table capture could ever have falsified. |

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

## Running the MV-156 rehearsal

Same shape, same local-only rule, and it **builds on MV-155's state** rather than replacing it. The
whole point of MV-156's rehearsal is a schema round trip, so the catalog capture is what matters and
the data capture exists to prove the migration does not touch rows.

```bash
PSQL="docker exec -i supabase_db_merovisa psql -U postgres -d postgres -tAX -v ON_ERROR_STOP=1"
```

1. **Pin the stack at MV-156's predecessor.** Move
   `supabase/migrations/20260803120000_stage2_owner_nullable_case_fk_rebase.sql` aside, run
   `npx supabase db reset --local`, and confirm `max(version) = 20260802120000`.
2. **Restore the data**, then run MV-155's backfill (the corpus loads *after* the migration applied,
   so the backfill has not seen it): `$PSQL -q < supabase/rehearsal/MV-155-rehearsal-corpus.sql`,
   then `select private.mv155_backfill_personal_cases();`. Substitute the founder's real dump here
   when one exists; every later step is identical.
3. **BASELINE — both captures, and keep them.**
   `$PSQL < supabase/rehearsal/MV-156-counts.sql  > data.before.txt`
   `$PSQL < supabase/rehearsal/MV-156-catalog.sql > catalog.before.txt`
   **`catalog.before.txt` is the artifact the whole rehearsal turns on.** Without it, step 7 cannot
   be performed at all — only guessed at.
4. **Apply MV-156 alone**, in one transaction, and time it:
   `$PSQL --single-transaction < supabase/migrations/20260803120000_*.sql`.
5. **AFTER:** re-run both captures. `diff data.before.txt data.after.txt` **must be empty** — MV-156
   is pure DDL, and the only rows it rewrites are the two tables gaining a surrogate `id`, whose
   fingerprints exclude that column precisely so the comparison stays meaningful. A non-empty data
   diff means the `ADD COLUMN` rewrite fired a row trigger (`set_updated_at` or MV-155's
   `_derive_case_id`), which is a defect, not a detail.
6. **Run the integration lane against the restored copy**: `npm run test:integration`.
7. **Execute the rollback, both paths.** First the refusal: seed one NULL-owner row
   (`insert into public.plan_items (owner, case_id, kind, impact, title) values (null, '<a case>', 'visa', 'low', 'x');`)
   and run `$PSQL < supabase/rehearsal/MV-156-rollback.sql` — it must **REFUSE** naming the table and
   count, and the schema must be **intact** afterwards, not half-unwound. Then delete that row and
   run it for real; it must end `MV-156 rollback verification: COMPLETE`.
   **Then the assertion that matters:** re-capture the catalog and
   `diff catalog.before.txt catalog.postrollback.txt` — **it must be empty.** That is what catches a
   rollback which restores the composite primary keys but forgets to drop the surrogate `id`
   columns: that unwind exits without error and leaves a *third* schema shape.

   **7a. Clear the bookkeeping row — the rollback's one fail-open residue, and it is a numbered step
   for that reason.** `MV-156-rollback.sql` restores the schema and asserts that it did, but it does
   **not** touch `supabase_migrations.schema_migrations`. On any database where MV-156 was applied
   through `supabase db push`, the history row for `20260803120000` outlives the unwind: the history
   then says *applied* while the catalog says *not applied*, and nothing in the system notices they
   disagree. Two consequences, and the second is the one that bites a human: `supabase db push`
   silently no-ops on a re-apply, and `supabase migration list` tells an operator the opposite of
   the truth at exactly the moment they are deciding whether it is safe to proceed.

   ```sql
   delete from supabase_migrations.schema_migrations where version = '20260803120000';
   ```

   Run it **immediately after the rollback commits**, not only when you intend to re-apply. It is a
   harmless no-op in the rehearsal itself — this procedure applies through `psql` with the migration
   file moved aside, so no row was ever written — which is precisely why the gap is easy to miss
   here and expensive to miss in production. Same class of manual-step-at-the-point-of-use that
   MV-155's `personal_case_ids` capture is (step 4a).
8. **Re-apply** step 4. Roll forward, roll back, roll forward again — a rollback tested in only one
   direction has not been tested. Expect **one** benign difference against the first apply: the
   re-added surrogate `id` lands at the next attnum (`user_program_state` 8 → 9, `document_status`
   6 → 7), because the dropped column left a gap. Four tables in this schema already carry such
   gaps; see the note at the foot of `MV-156-rollback.sql`.

## Running the MV-159 rehearsal

MV-159 changes **no data**, so there is no backfill to replay and no row count to compare. What it
changes is what live users can SEE, and that failure is silent: an RLS SELECT refusal returns zero
rows and no error, so a wrong predicate does not throw — it makes a real student's assessments
disappear. The rehearsal is therefore a **visible-row-id diff per owner per table**, and the thing
that makes it evidence rather than decoration is that every read is issued after
`set local role authenticated`. Run the same query as `postgres` and BYPASSRLS returns every row of
every table for every "owner": the diff is empty however wrong the policies are.

1. `npx supabase start`, then `npx supabase db reset`. Every migration applies, MV-159 included.
2. `docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/rehearsal/MV-159-rollback.sql`
   — this is what pins the stack at **post-MV-156 / pre-MV-159**. It also exercises the rollback,
   which is the point: R2 is run for real before the forward script is, not after an incident.
3. Load `MV-155-rehearsal-corpus.sql` (or the founder-supplied dump in its place), then
   `select private.mv155_backfill_personal_cases();` so every row carries the `case_id` production
   has. **Skipping the backfill is the way to get a meaningless green:** with no `case_id`
   anywhere, every case predicate matches nothing and the transitional owner disjunct carries 100%
   of the load. `MV-159-visibility.sql`'s guard 0 refuses that state rather than reporting on it.
4. **Copy the rehearsal and the migration into the container, then run the script BY PATH** —
   not on stdin:

   ```sh
   DB=$(docker ps --filter name=supabase_db_ --format '{{.Names}}')
   docker exec "$DB" rm -rf /tmp/mv159 && docker exec "$DB" mkdir -p /tmp/mv159/supabase
   docker cp supabase/migrations "$DB":/tmp/mv159/supabase/migrations
   docker cp supabase/rehearsal  "$DB":/tmp/mv159/supabase/rehearsal
   docker exec "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
     -f /tmp/mv159/supabase/rehearsal/MV-159-visibility.sql
   ```

   **THIS STEP USED TO BE `... -f - < MV-159-visibility.sql` AND IT COULD NOT WORK.** The script
   applies the migration inline, and with `-f -` psql reads the script from **stdin**, where a
   relative `\i` resolves against psql's CWD — inside the container, which mounts only `pgdata`.
   Measured: `No such file or directory`, and step 4 aborted before capturing anything. The
   script now uses `\ir` (relative to the script's OWN location), which is why it must be run by
   path and why both directories are copied in with their relative layout preserved.

   It captures, applies the migration, re-captures, prints a per-owner/per-table table and a
   case-arm-only table, and **raises** on any moved set, on any widening, and on any pair that is
   visible only through the transitional owner disjunct. Then it rolls back, so the stack is still
   pre-MV-159 and step 4 can be repeated.
5. Re-apply for real (`npx supabase db reset`) and run `npm run test:integration`. Roll forward,
   roll back, roll forward again — a rollback tested in only one direction has not been tested.

**What the rehearsal cannot prove**, same caveat as MV-155's and narrower: the corpus reproduces
shapes and counts, not the real `sections` / `result` / `profile_snapshot` payloads. No policy in
MV-159 reads any of those columns, so the gap is smaller here — but the founder-gated dump replay
is still owed before the production apply.

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

## Applying MV-156 to production

**Founder-gated. Nothing in this section is an agent action.** It exists because MV-156 is the
**higher-consequence apply of the two** — MV-155 added columns and updated rows; MV-156 **replaces
two primary keys, changes the foreign-key topology of the outcomes chain, and rewrites two tables** —
and until this section existed the higher-consequence apply was the one with no written path.

### The command, and why it is atomic

```bash
npx supabase link --project-ref obfvrxixtautamflzxzq   # once
npx supabase db push
```

Identical mechanism to MV-155, and the atomicity was **measured** there, not assumed — see
§"Applying MV-155 to production" above for the experiment and its two-row result table. The same
three consequences carry:

- The file carries **no `begin;`/`commit;`**, deliberately. `supabase db push` submits it as one
  multi-statement simple query, which Postgres runs as a single **implicit transaction**; an inner
  `commit` would end that early and leave a half-applied schema the migration history does not know
  about. MV-156 is the file where that matters most: a half-apply that stopped after the PK drop
  and before the PK add leaves `user_program_state` with **no primary key at all**.
- `set lock_timeout = '10s'` is a plain `set`, not `set local`, for the 25P01 reason recorded above.
  **Read the lock note in the migration header before applying:** two of the eight tables are
  REWRITTEN under `ACCESS EXCLUSIVE` (the surrogate `id` has a VOLATILE default) and the other six
  take the same lock for `drop not null`. The work is sub-millisecond at 12 and 0 rows; what the
  timeout bounds is the **wait to acquire**, behind which every reader of the shortlist and the
  document checklist would queue. A `55P03 lock_not_available` is the migration doing its job —
  retry it, do not raise the timeout.
- **Statement-by-statement application is not acceptable** — no Studio SQL editor, no paste, no
  `psql` without `--single-transaction`. If a different path is ever used, it is one explicit
  transaction plus the bookkeeping row by hand, exactly as spelled out for MV-155:

  ```bash
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
    -f supabase/migrations/20260803120000_stage2_owner_nullable_case_fk_rebase.sql
  psql "$DATABASE_URL" -c "insert into supabase_migrations.schema_migrations (version) \
    values ('20260803120000');"
  ```

### Before the push

1. **The rehearsal against the founder's real dump has happened and is recorded on the card**, dated
   before this apply (MV-154's reversibility doctrine). The corpus rehearsal is not a substitute.
2. **Capture the pre-apply baseline from PRODUCTION**, not from the rehearsal host:
   `psql "$DATABASE_URL" -tAX -f supabase/rehearsal/MV-156-counts.sql  > prod.data.before.txt`
   `psql "$DATABASE_URL" -tAX -f supabase/rehearsal/MV-156-catalog.sql > prod.catalog.before.txt`
   Without these the post-apply comparison below cannot be performed, only guessed at — and
   `prod.catalog.before.txt` is also the only thing a rollback can be verified against.
3. **Confirm MV-155 is applied and reconciled:** `select private.mv155_assert_case_backfill();`
   must report CLEAN, and `case_id` must be non-null on every row of the three chain tables. MV-156
   cannot create its `unique (id, case_id)` targets otherwise.

### Verify the apply was COMPLETE, not merely error-free

Atomicity means a failure leaves nothing behind; it does not prove the operator ran the whole file.
**Run this immediately after the push** — it asserts and raises rather than printing, so a partial
or wrong apply is a loud failure rather than something to eyeball:

```sql
do $$
declare
  v_problems text[] := '{}';
  v_n int;
begin
  -- 1. owner is nullable on exactly the eight
  select count(*) into v_n from information_schema.columns
   where table_schema='public' and column_name='owner' and is_nullable='YES'
     and table_name in ('profiles','plan_items','user_program_state','documents','document_status',
                        'program_predictions','application_attempts','outcome_events');
  if v_n <> 8 then v_problems := v_problems || format('owner nullable on %s of 8 tables', v_n); end if;

  -- 2. all eight compensating checks exist AND are VALIDATED (convalidated, not merely present)
  select count(*) into v_n from pg_constraint
   where contype='c' and convalidated and conname like '%\_ownership\_axis\_present';
  if v_n <> 8 then v_problems := v_problems || format('%s of 8 validated _ownership_axis_present checks', v_n); end if;

  -- 3. the new case chain: 3 unique targets + 2 composite FKs, then their 2 covering indexes
  select count(*) into v_n from pg_constraint
   where conname in ('program_predictions_id_case_id_key','application_attempts_id_case_id_key',
                     'outcome_events_id_case_id_key','application_attempts_prediction_id_case_id_fkey',
                     'outcome_events_attempt_id_case_id_fkey');
  if v_n <> 5 then v_problems := v_problems || format('%s of 5 case-chain objects', v_n); end if;
  select count(*) into v_n from pg_indexes where schemaname='public'
   and indexname in ('application_attempts_prediction_id_case_id_idx','outcome_events_attempt_id_case_id_idx');
  if v_n <> 2 then v_problems := v_problems || format('%s of 2 covering indexes', v_n); end if;

  -- 4. THE 42P10 CANARY. Both replacement uniques must exist and be FULL — indpred IS NULL. A
  --    partial one cannot be inferred by PostgREST's bare on_conflict= and takes the live document
  --    checklist down on the next request. This is the check that would have caught the defect the
  --    builder found by measurement; it is here so a future re-cut cannot reintroduce it silently.
  select count(*) into v_n from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname in ('user_program_state_owner_program_idx','document_status_owner_kind_idx')
     and i.indisunique and i.indpred is null;
  if v_n <> 2 then v_problems := v_problems || format('%s of 2 replacement uniques are FULL unique indexes', v_n); end if;

  -- 5. both primary keys are the surrogate id
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid='public.user_program_state'::regclass and contype='p')
     is distinct from 'PRIMARY KEY (id)'
  then v_problems := v_problems || 'user_program_state PK is not PRIMARY KEY (id)'; end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid='public.document_status'::regclass and contype='p')
     is distinct from 'PRIMARY KEY (id)'
  then v_problems := v_problems || 'document_status PK is not PRIMARY KEY (id)'; end if;

  -- 6. the LEGACY owner chain is still fully intact — MV-156 drops none of it; MV-160 does
  select count(*) into v_n from pg_constraint
   where conname in ('program_predictions_id_owner_key','application_attempts_id_owner_key',
                     'outcome_events_id_owner_key','application_attempts_prediction_id_owner_fkey',
                     'outcome_events_attempt_id_owner_fkey');
  if v_n <> 5 then v_problems := v_problems || format('legacy owner chain is %s of 5', v_n); end if;

  if array_length(v_problems, 1) > 0 then
    raise exception 'MV-156 apply verification FAILED: %', array_to_string(v_problems, '; ');
  end if;
  raise notice 'MV-156 apply verification: COMPLETE';
end;
$$;
```

Then, in this order:

1. **Data must be untouched.** Re-run the counts script and `diff prod.data.before.txt` — **empty**.
   MV-156 writes no row data; the two table rewrites exclude the surrogate `id` from the fingerprint
   precisely so this comparison stays meaningful. A non-empty diff means the `ADD COLUMN` rewrite
   fired `set_updated_at` or MV-155's `_derive_case_id` seam trigger, which is a defect.
2. **Catalog diff, read line by line.** Re-run the catalog script and diff. Expect **48 lines, all
   intended**: 8 `owner` `NO → YES` flips, 8 checks, 5 new uniques, 2 composite FKs, 2 covering
   indexes, 2 surrogate columns, 2 PK swaps. **Nothing under `assessments`, no policy line, and no
   `INSERT`/`UPDATE`/`DELETE` column-grant line** — `SELECT` legitimately gains the two new
   surrogate `id` columns because it is a table-level grant. Anything else is a finding.
3. **Smoke the two live upsert paths — this is the one failure the catalog cannot show you.** Open
   the document checklist as a real signed-in student and toggle one item
   (`app/api/documents/status/route.ts` → `setObtained`), then add a program to the shortlist
   (`app/api/shortlist/route.ts` → `upsertProgramState`). Both compile to
   `INSERT … ON CONFLICT DO UPDATE` against the replacement uniques. A **42P10** here means an
   arbiter is not inferrable and check 4 above should have caught it; treat it as an incident and
   roll back rather than "fixing forward".
4. **Advisors.** Re-run the Supabase performance advisor: `unindexed_foreign_keys` must be silent.
   Two new composite FKs mean two required covering indexes, and `20260620010000` exists only
   because that was missed once already on this exact chain.
5. **Record on the card:** the wall clock, the two diffs, the advisor result, and the smoke result.

Anything other than `MV-156 apply verification: COMPLETE` — including a raised exception — means
**do not proceed**, and no Stage 2 slice merges until it is understood.

### Rolling MV-156 back in production

`supabase/rehearsal/MV-156-rollback.sql`, run through `psql -v ON_ERROR_STOP=1`. It is one
transaction, it refuses rather than half-runs (four guards plus an in-transaction post-condition
block), and it needs no `-v` flag. Two things the script cannot do for you:

1. **Delete the bookkeeping row, immediately after it commits.** The rollback restores the schema
   and does not touch the migration history, so the history says applied while the catalog says
   otherwise:

   ```sql
   delete from supabase_migrations.schema_migrations where version = '20260803120000';
   ```

2. **Diff the catalog against `prod.catalog.before.txt`.** "The rollback ran" and "the rollback
   restored" are different claims and only the diff proves the second.

**The hard expiry is real and it is not far away:** step 6 re-applies `SET NOT NULL` to `owner`, which
succeeds only while no NULL-owner row exists. The first consultancy row Stage 3 writes ends that
permanently, and the recovery path becomes a restore from backup (spec §10.2). Guard 2 refuses with
the table names and the count rather than letting Postgres raise a bare `23502`.

## Applying MV-159 to production

**Founder-gated. Nothing in this section is an agent action.**

This section exists because it did not, and that was the **third recurrence of the same omission**:
MV-155 and MV-156 each shipped a rollback that silently left the migration-history row behind, each
was caught in review, and each wrote a numbered step at the point of use. MV-159 then shipped with
**no "Applying" and no "Rolling back" section at all**, so there was nowhere for the step to live
and the lesson had nothing to attach to. Both sections are below, in MV-156's shape.

### The command

```bash
npx supabase link --project-ref obfvrxixtautamflzxzq   # once
npx supabase db push
```

Same mechanism and same atomicity argument as MV-155/MV-156 — the file carries no
`begin;`/`commit;` and `supabase db push` submits it as one implicit transaction. MV-159 is the
**lowest-consequence apply of the three on data** (it writes none) and the **highest on
visibility**: it swaps 24 policies on nine student-facing tables, and a wrong predicate does not
raise, it silently returns zero rows.

`set lock_timeout = '10s'` bounds the `ACCESS EXCLUSIVE` each `drop policy` / `create policy` takes.
The work is sub-millisecond; what the timeout bounds is the **wait to acquire**. A
`55P03 lock_not_available` is the migration doing its job — retry, do not raise the timeout.

**Statement-by-statement application is not acceptable.** If a different path is ever used it is
one explicit transaction **plus the bookkeeping row by hand**:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f supabase/migrations/20260803180000_case_aware_student_data_rls.sql
psql "$DATABASE_URL" -c "insert into supabase_migrations.schema_migrations (version) \
  values ('20260803180000');"
```

### Before the push

1. **Capture the pre-apply catalogue**, which is what the rollback's fingerprint is compared to:

   ```bash
   psql "$DATABASE_URL" -tAc "select c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||
     coalesce((select string_agg(r.rolname,',' order by r.rolname) from pg_roles r
                where r.oid = any(p.polroles)),'PUBLIC')||'|'||
     coalesce(pg_get_expr(p.polqual,p.polrelid),'-')||'|'||
     coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'-')
     from pg_policy p join pg_class c on c.oid=p.polrelid
     join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname in ('profiles','assessments','plan_items',
       'user_program_state','documents','document_status','program_predictions',
       'application_attempts','outcome_events') order by 1;" > prod.mv159.policies.before.txt
   ```

2. **Confirm zero `owner IS NULL` case-bearing rows**, which is the rollback's Guard 2 hazard and
   therefore the window in which R2 is lossless:

   ```sql
   select count(*) from public.user_program_state where owner is null and case_id is not null;
   ```

3. **Confirm the residue is still zero** (`private.mv155_assert_case_backfill()` raises if not).

### Verify the apply was COMPLETE, not merely error-free

```sql
select count(*) from pg_policy where polname like '%\_case';          -- expect 24
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='private' and p.proname in ('actor_case_ids','assessment_case_id',
   'prediction_case_id','attempt_case_id');                            -- expect 4
select count(*) from pg_trigger where tgname in ('user_program_state_derive_case_id',
   'document_status_derive_case_id') and not tgisinternal and tgqual is not null;  -- expect 0
select version from supabase_migrations.schema_migrations where version = '20260803180000';
```

The third one is the §1b binding guard: a non-zero count means a `WHEN` clause survived and
`owner -> NULL` would not fire the guard. The migration asserts all of this at apply time too —
these are the same properties, checked from outside, so a partially-applied file cannot claim them.

Then run the **student-facing smoke**: sign in as a real account, load the dashboard, the document
checklist and the shortlist. A silent RLS regression looks exactly like an empty account.

### Rolling MV-159 back in production

`supabase/rehearsal/MV-159-rollback.sql`, run through `psql -v ON_ERROR_STOP=1`. One transaction,
four guards plus a closing catalogue fingerprint, no `-v` flag, and **no point of no return** — it
mutates no data and re-runs. Two things the script cannot do for you:

1. **Delete the bookkeeping row, immediately after it commits.** The rollback restores the policies
   and does not touch the migration history, so the history says applied while the catalogue says
   otherwise — and the next `supabase db push` will therefore NOT re-apply MV-159:

   ```sql
   delete from supabase_migrations.schema_migrations where version = '20260803180000';
   ```

   **This is the step MV-155 and MV-156 each shipped without.** It is written here, at the point of
   use, for the same reason theirs are.

2. **Diff the catalogue against `prod.mv159.policies.before.txt`.** The script's closing block
   hashes the restored catalogue and compares it against the fingerprint measured on a pre-MV-159
   stack (`827bf303bff5f90d84780f03f5e6c0e6` as of 2026-08-04), which turns "the rollback ran" into
   "the rollback restored" — but that hash is a *local* measurement. On production, diff against the
   file captured in "Before the push"; if the two disagree the hash cannot tell you which policy.

**Guard 2 is the one to read before running it.** It refuses if ANY case-bearing row has
`owner IS NULL`, because the legacy `(select auth.uid()) = owner` predicates this script restores
evaluate NULL for such a row and RLS admits only TRUE — every one of them would vanish from the
counsellor and admin who own its case, silently. MV-160 is the usual cause but not the only one:
MV-157's dual-write writes `owner IS NULL` on every consultancy-created row, so the **first
consultancy row makes this rollback lossy**, long before MV-160.

## Applying MV-168 to production

**Founder-gated: run it only on an explicit, in-the-moment go.** Earlier revisions of this file said
"nothing in this section is an agent action," and that was wrong on the facts — see the status note
directly below, which records an agent performing exactly this apply under a founder's go. The gate
is the founder's decision, not the identity of whoever types the command.

> **STATUS — APPLIED 2026-08-11.** Production (`obfvrxixtautamflzxzq`) carries these grants. Applied
> by agent on the founder's explicit go, via the Supabase MCP's `execute_sql` rather than
> `supabase db push` (the CLI is broken on win32-x64 here) — the whole file in one implicit
> transaction, all six assertions silent. The ledger row was then inserted **by hand as
> `20260808120000`**, matching the repo, because `apply_migration` stamps a version of its own and
> that is what caused the 2026-08-07 drift. Verified afterwards from outside the file: the three
> grants exact to their column lists, the three policies attached to the verbs they claim, and the
> three permanent refusals still absent. Pre-apply state was clean — `assessments` held no UPDATE
> grant at all, so assertion (3) had no drift to find. The procedure below stands as written and is
> what a re-apply, a second environment, or a post-rollback restore should follow.

This section exists because MV-168 shipped without one, which is the **fourth recurrence** of the
omission the MV-159 section above was written to end. The pattern is now unmistakable: a slice adds
a migration, the rollback gets written, and the apply procedure — and with it the bookkeeping-row
step — has nowhere to live. MV-168 also arrived with no row in the **Files** table, so
`MV-168-rollback.sql` existed on disk and in no index. Both are fixed here.

MV-168 differs from the three above in a way that matters to whoever runs it: it is the **lowest
consequence of the four**. It writes no data, changes no schema object, and adds no column, index,
constraint or trigger. What it does is hand `authenticated` three new write verbs, so the risk is
not corruption but **over-grant** — and the file's own closing `do $$` block is six assertions
aimed squarely at that.

### The command

```bash
npx supabase link --project-ref obfvrxixtautamflzxzq   # once
npx supabase db push
```

Same atomicity argument as MV-155/MV-156/MV-159: the file carries no `begin;`/`commit;`, so
`supabase db push` submits it as one implicit transaction. Every assertion is inside that
transaction, so **a raise means nothing landed** — there is no partially-granted state to clean up.

**Caveat measured on the founder's Windows machine (recorded on `docs/kanban/cards/MV-168-consultancy-write-grants.md:118`):**
`npx supabase` fails there on win32-x64 binary resolution. If that is the machine in front of you,
use the fallback below or the Dashboard SQL Editor — not a statement-by-statement paste, which
loses the transaction and can leave a grant in place with no policy.

### If a different path is ever used

One explicit transaction **plus the bookkeeping row by hand**:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f supabase/migrations/20260808120000_stage3_consultancy_write_grants.sql
```

```bash
psql "$DATABASE_URL" -c "insert into supabase_migrations.schema_migrations (version) \
  values ('20260808120000');"
```

**Unlike MV-159, this file sets no `lock_timeout`.** Each `grant`, `drop policy` and `create policy`
takes a brief `ACCESS EXCLUSIVE` on its table; the work is sub-millisecond and what would be bounded
is the *wait to acquire*. Set one in-session (`set lock_timeout = '10s';`) if the project is under
load. A `55P03 lock_not_available` is a retry, not a failure.

### Before the push

**Capture the pre-apply grant surface.** This is what the rollback is verified against, and it is
also the only thing that will tell you *what drifted* if assertion (3) refuses:

```bash
psql "$DATABASE_URL" -tAc "select table_name||'|'||privilege_type||'|'||column_name
  from information_schema.column_privileges where grantee='authenticated'
  and table_schema='public' and table_name in ('profiles','plan_items','assessments')
  order by 1;" > prod.mv168.grants.before.txt
```

**Read assertion (3) before you run the file.** It requires the `assessments` UPDATE grant to be
*exactly* `is_primary` and raises otherwise. That is not a formality: `result` and `rule_version`
are scoring outputs, and a client that can write them mints its own verdict against the server-side
rule — the trust property this product sells. If production has drifted to hold any other UPDATE
column on `assessments`, **the migration will refuse, and that refusal is correct.** Resolve the
drift; do not widen the assertion.

### Verify the apply was COMPLETE, not merely error-free

```sql
select table_name, string_agg(column_name, ', ' order by column_name)
  from information_schema.column_privileges
 where grantee='authenticated' and table_schema='public'
   and table_name in ('profiles','plan_items','assessments')
   and privilege_type in ('INSERT','UPDATE')
 group by table_name order by 1;
select polname, polcmd from pg_policy
 where polname in ('profiles_insert_case','plan_items_insert_case','assessments_update_case');
select version from supabase_migrations.schema_migrations where version = '20260808120000';
```

Expect `assessments` = `is_primary`; `profiles` = `case_id, completeness, owner, sections`;
`plan_items` = `body, case_id, impact, kind, lift_estimate, owner, status, time_estimate, title`;
three policies with `polcmd` `a`, `a`, `w`. The migration asserts all of this at apply time too —
these are the same properties checked **from outside**, so a partially-applied file cannot claim
them.

Then run the **consultancy-facing smoke**, which is what these grants exist for: as an org
owner/admin, create a case, assign a primary counsellor, and open it. Those paths run on the
`authenticated` client now; before this migration they fail with `42501`.

### Rolling MV-168 back in production

`supabase/rehearsal/MV-168-rollback.sql`, run through `psql -v ON_ERROR_STOP=1`. One transaction,
no `-v` flag, and no point of no return — it mutates no data and re-runs. It drops the **policies
before the grants**, because a granted verb with no policy is an *unfiltered* verb, and it leaves
the database in MV-160's end state. Two things the script cannot do for you:

1. **Delete the bookkeeping row, immediately after it commits.** The rollback is a script, not a
   migration, and carries no entry in `supabase_migrations` — so the history will say applied while
   the catalogue says otherwise, and the next `supabase db push` will therefore NOT re-apply MV-168:

   ```sql
   delete from supabase_migrations.schema_migrations where version = '20260808120000';
   ```

   **This is the step MV-155, MV-156 and MV-159 each shipped without.** It is written here, at the
   point of use, for the same reason theirs are.

2. **Diff the restored grant surface against `prod.mv168.grants.before.txt`.** The script's closing
   assertions include an over-revoke check that Stage 2's five UPDATE grants survived, but "the
   rollback ran" and "the rollback restored" are separate claims and only the diff settles the
   second.

**Order matters, and getting it wrong is loud rather than silent.** MV-168 is Stage 3 and landed
after Stage 2, so it unwinds FIRST:

```
MV-168-rollback.sql  →  MV-160-rollback.sql (R1)  →  MV-159-rollback.sql (R2)
```

`MV-161-rollback.sql` **is not a step in that chain** — R1 deliberately keeps MV-161's P0 pointer
bound, and MV-161-rollback's own header says twice that it is a rehearsal-host tool, not an incident
tool. Reach for R1 while MV-168's three policies are still in place and its Guard 1 refuses: it
counts the `%_case` policies on the nine student tables and expects MV-159's twenty-four, and
MV-168's three are named to the same convention, so the count reads 27. That refusal is correct —
the database is not in the state R1 was written against — and R1 carries a guard that names this
file, so an operator who arrives out of order reads an instruction rather than a count to decode.

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
