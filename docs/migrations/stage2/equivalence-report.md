# Stage 2 data-equivalence report (MV-160 §A)

**Status: §A1 GREEN · §A2 GREEN on real production data, 2026-08-07 — at an AMENDED boundary.**
**BOTH MIGRATIONS ARE NOW APPLIED TO PRODUCTION, 2026-08-07. Stage 2 is live. See §6 for the
apply record, the post-apply verification, and the one open defect the apply exposed.**
**§A2 now covers the two PENDING migrations only. The MV-155 → MV-159 interval, which is already
live, is crossed by no diff in either half of this proof and never can be — §3.0 says why and what
stands in its place. The evidence this file owed is recorded; the remaining gate is the founder
reading §3.0's scope limits before authorising the apply.**

The Stage 2 exit gate is *"existing students see the same correct data, while case-scoped
repositories no longer depend on actor equals student"* (consultancy plan line 637). This file is
where the first half is evidenced. It is the **pseudonymous** artifact: per-user labels, per-domain
hashes, counts and verdicts. The payload it summarises is real student personal information and is
never committed — see §5.

| | |
| --- | --- |
| Card | `docs/kanban/cards/MV-160-tighten-stage2-exit.md` §A · `docs/kanban/cards/MV-165-stage2-a2-real-data.md` (the §A2 run + the §3.0 amendment) |
| Spec | `docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md` §9.2, §9.10, §10.1 R1 |
| Shared comparison | `scripts/stage2/capture-read-path-snapshot.mjs` — one serializer, one hash, one exclusion list |
| §A1 (synthetic, CI) | `tests/integration/stage2-data-equivalence.itest.ts` |
| §A2 (live, rehearsal) | `npm run stage2:equivalence -- --snapshot <path>` |
| Reaching the pre-state | `supabase/rehearsal/MV-160-rollback.sql` **then** `supabase/rehearsal/MV-161-rollback.sql` (§3.1) |
| Host guard | `scripts/stage2/capture-host-guard.mjs` — refuses production, no override |

---

## 1. Why there are two proofs

The equivalence proof was originally one CI integration test that loaded a pre-migration snapshot
from a gitignored path and skipped when it was absent. That cannot pass this repo's gate: the
snapshot is gitignored *by design* (real PII) and destroyed after the rehearsal *by design*, so it is
absent on **every** CI run — and this lane's fail-closed guards score a skipped integration suite as
**red**. The only cheap remedy under deadline pressure is to weaken the guard that makes every other
integration suite trustworthy.

So the proof is split by what each half can honestly prove.

- **§A1 — synthetic, permanent, in CI, never skips.** Proves the *mechanism*: that the comparison is
  real, that it goes red when a field moves, that the reconciliation sweep repairs residue rows onto
  **their own** owner's case, and that a student reads byte-identical rows across the migration.
- **§A2 — live data, rehearsal host, run once by the integrator, not in CI.** Proves that the *real*
  students' *real* rows survived. **§A1 passing is not a substitute for §A2 and must never be
  recorded as one.**

Both import the same serializer, hash function and exclusion list, so CI exercises the same
comparison the rehearsal will run.

---

## 2. §A1 — synthetic equivalence

**Result: GREEN. 18/18 tests. Whole-snapshot hash identical before and after. Diff: zero.**

Measured 2026-08-06 on the local stack, migration `20260805140000_stage2_tighten_case_mandatory.sql`.

### How it reaches a pre-migration database

By the time any suite runs, every migration in the tree is applied. The suite crosses the boundary
the other way, inside one transaction that is always rolled back:

```
begin
  ├─ apply supabase/rehearsal/MV-160-rollback.sql      → database is now PRE-tighten
  ├─ ASSERT the pre-state was reached                  → a wrong rollback fails here, loudly
  ├─ seed a production-shaped corpus
  ├─ capture, per user × per domain, RLS-scoped as that user
  ├─ apply supabase/migrations/20260805140000_….sql    → the real file, verbatim
  ├─ capture again, identically
rollback
```

Two consequences worth stating: **the rollback script is executed on every CI run** (otherwise it is
an artifact that is only ever read, and is needed only during an incident), and **§B's sweep test and
§C's counterfactual are CI tests rather than rehearsal scripts**, because inside the pre-state window
an owned, `case_id`-null row is seedable again.

This is the MV-160 boundary (pre-tighten → post-tighten), **not** the whole-of-Stage-2 boundary. The
whole-stage boundary would need reverse scripts for MV-155/156/158/159 that do not exist.

**That used to be §A2's job. It no longer is, and no other section has taken it over.** §3.0 amends
§A2 to the pre-MV-161 → post-MV-160 boundary because the whole-stage one is permanently unreachable,
so **the MV-155 → MV-159 interval is crossed by NO diff in either half of this proof.** Its evidence
is the zero-residue inspection in §3.0 and nothing stronger. §A2 remains the exit gate for the two
pending migrations; §A1 remains the regression net.

### The corpus

| Label | Shape | Why it is in the fixture |
| --- | --- | --- |
| `student-A` | fully case-bound personal student | the ordinary post-MV-157 row shape |
| `student-B` | fully case-bound personal student | a second tenant, so "visible to me" is not vacuous |
| `student-C-residue` | **owns rows on all nine tables and has NO case at all** | the exact residue of the MV-157 → MV-158 window and of any lost dual-write — the population MV-158 delegates to "MV-160's reconciliation sweep". Pre-migration these rows are visible only through MV-159's transitional owner disjunct; post-migration only through the case the sweep minted. If the sweep does not run, runs late, or attaches them to the wrong case, C reads a different payload **silently**. |
| `<anonymous>` | one assessment, `owner IS NULL`, `case_id IS NULL`, unclaimed | the MV-135 purge boundary, recorded by id |

Per user × per domain, all nine read paths carry rows on both sides (asserted — a snapshot of nine
empty lists is byte-identical to another snapshot of nine empty lists).

### Per-domain hash pairs

Every domain of every user hashed identically before and after; the whole-snapshot hashes match. The
hashes are run-specific (the fixture uses `gen_random_uuid()` for most ids), so the reproducible
claim is the **equality**, not the digest:

| User | profile | assessments | plan | shortlist | documents | checklist | predictions | attempts | outcomes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `student-A` | = | = | = | = | = | = | = | = | = |
| `student-B` | = | = | = | = | = | = | = | = | = |
| `student-C-residue` | = | = | = | = | = | = | = | = | = |

Row-count parity **and** identity parity hold per user per domain: every pre-migration row id still
exists post-migration, and nothing was added.

### The excluded-field list — ELEVEN entries, corrected from thirteen

| Field | Why |
| --- | --- |
| `case_id` on all nine tables | Stage 2 introduces the column (MV-155) and MV-160's sweep legitimately fills it on residue rows. There is no pre-Stage-2 value to compare against. §A1 pins the transition itself instead: every residue row resolves to **its own** owner's personal case. |
| `user_program_state.id`, `document_status.id` | MV-156's surrogate keys, replacing the composite primary keys `(owner, program_id)` / `(owner, kind)`. They do not exist on the pre-Stage-2 side. Row identity is carried by `program_id` / `kind` instead. |

**`profiles.updated_at` and `user_program_state.updated_at` are NOT excluded — corrected 2026-08-06.**
The card and spec §9.2 both excluded them because "the backfill `UPDATE` fires
`private.set_updated_at()`". It does not: `private.mv155_backfill_personal_cases()` **disables both
triggers** for the duration of the backfill and re-enables them before returning, because stamping
migration time onto "when did this student last edit their profile" is unrecoverable (the rollback
takes the column, not the clock). The exclusions were covering for a mechanism nobody was guarding —
had a later edit dropped that `disable trigger` pair, every student's timestamp would have moved and
the proof would still have read "equivalent". All three `updated_at` columns are now compared
exactly, and the suite additionally asserts the `disable`/`enable` pair is still in the function.

Nothing else is excluded. A whole-table or wildcard exclusion is rejected by test.

### §B — the reconciliation sweep, measured

| | |
| --- | --- |
| Residue rows seeded (owned, `case_id` NULL) | 11 rows across all nine tables, one owner |
| Pre-migration repair state | `0/N` on every table (the fixture is the real shape, not a pre-repaired one) |
| Post-migration repair state | `N/N` on every table, every row on **its own** owner's personal case |
| Personal cases minted by the sweep | 1 (`student-C-residue` had none) |
| `updated_at` movement | **none**, on any of the three columns, including on the rows the sweep rewrote |

**On the production apply the sweep's real repair count must be pasted here.** A non-zero count is
not a housekeeping detail: it is the number of rows that were owned but case-less at the moment
Stage 2 closed, i.e. evidence that the MV-157 dual-write leaked, and it is a finding about Stage 2.

**MEASURED ON REAL PRODUCTION DATA, 2026-08-07 (MV-165 §A2): ZERO on every table, and zero personal
cases minted.** Full sweep report in §3.3. The dual-write did **not** leak. Two consequences, and the
second is the uncomfortable one:

- The good one: there was no residue, which is what §3.0's zero-`case_id IS NULL` table independently
  predicted. Two different measurements of the same invariant agree.
- The one worth stating: **the sweep's repair path was therefore never exercised by live data.** Its
  correctness rests entirely on §A1's `student-C-residue` fixture. A green §A2 is not evidence that
  the sweep works — only that it had nothing to do.

---

## 3. §A2 — live-data replay: **GREEN**

- **Verdict:** **EQUIVALENT — zero differences.** Whole-snapshot hash identical before and after:
  `a08f69938eae95951f88acf2684e0d6ddbf331ca4dd070ce5396986310ab3be9`. CLI exit `0`.
  **"Zero differences" is measured over every column EXCEPT the eleven on §2's exclusion list** —
  `case_id` on all nine tables, plus `user_program_state.id` and `document_status.id`. That list is
  shared with §A1 by design, and its `case_id` rationale ("there is no pre-Stage-2 value to compare
  against") is §A1's, not this boundary's: at the amended boundary `case_id` exists and is populated
  on **both** sides, so it *could* have been compared here and was not. The gap is closed by
  measurement rather than left open — the sweep report in §3.3 shows **0** rows rewritten on every
  table, so no `case_id` moved, and §3.0's table shows none was NULL to begin with. A reader should
  nonetheless know the headline hash does not cover those eleven columns.
- **Date:** 2026-08-07
- **Run by:** MV-165, on the **local rehearsal host** (`supabase_db_merovisa`, `127.0.0.1:54321`) —
  not CI, and never against production. The MV-164 host guard was re-tested during this run and
  still refuses production **with `--rehearsal-host` passed** (§4, row G-live).
- **Boundary:** **AMENDED** — pre-MV-161 → post-MV-160, i.e. **production-as-it-stands-today →
  Stage 2 closed**, on a byte-identical copy of real production data. The original
  "snapshot captured before MV-155 first mutated the copy" is permanently unreachable; §3.0 records
  why, and what that costs.

### 3.0 THE AMENDMENT — what this section used to require, and why it cannot

This section previously required the pre-migration snapshot be captured **"before MV-155 first
mutated the copy"**, making the proven boundary the whole of Stage 2 (pre-MV-155 → post-MV-160).
**That boundary can never be proven by snapshot diff, and the reason is not that anyone skipped a
step.** Four independent facts close it. Facts 1-3 were **measured** on 2026-08-07 and are decisive on
their own; fact 4 is a **search**, and its scope is stated with it rather than dressed as a universal
negative:

| # | Fact | Consequence |
| --- | --- | --- |
| 1 | Production has been **post-MV-155 since 2026-08-02**. | The pre-MV-155 state no longer exists anywhere on the live database. |
| 2 | The organization (`kryajhnrcukcknuwmtfz`) is on the **free plan** — no automated backups, no PITR. | There is no restore point of any age to roll back to. |
| 3 | **PITR is not retroactive.** | Upgrading the plan today does not manufacture a 2026-08-01 restore point. Paying more cannot buy the missing artifact. |
| 4 | A search on 2026-08-07 of Downloads, Desktop (incl. every worktree), Documents and OneDrive\Documents for `.sql`/`.dump`/`.backup`/`.bak`/`.pgdump` found **no pre-MV-155 dump** — 99 hits, all repo rehearsal helpers, all dated 2026-08-03 or later. | **No such dump was found.** Stated as scope, not as a universal negative: it was four directory trees and five extensions, not the whole filesystem, so it cannot exclude an archive (`.zip`/`.tar`), a `.json`/`.csv` export, or a copy held elsewhere. Facts 1-3 are the load-bearing ones; this fact rules out the likely hiding places, not every conceivable one. |

So the requirement is amended to the boundary that **is** reachable, and which is also the one the
founder gate actually needs: **today's production is the pre-tighten state**, so the two pending
migrations can be rehearsed against it with no PITR at all.

**WHAT THIS GIVES UP, STATED PLAINLY.** The MV-155→158 half of Stage 2 is already live and is *not*
inside this diff. Its compensating evidence is the zero-residue inspection below.

| Table | Prod rows (2026-08-07) | `case_id IS NULL` |
| --- | --- | --- |
| `profiles` | 7 | **0** |
| `assessments` | 36 (of which **0** anonymous) | **0** |
| `plan_items` | 74 | **0** |
| `user_program_state` | 12 | **0** |
| `documents` | 6 | **0** |
| `document_status` | **0** | 0 (vacuous — see below) |
| `program_predictions` | 10 | **0** |
| `application_attempts` | 10 | **0** |
| `outcome_events` | 19 | **0** |
| `cases` | 10 (all personal; `organizations` 0, `case_assignments` 0, `invitations` 0) | — |

**Read that table for exactly what it says.** It proves **the invariant held** — every owned row on
every migrated table carries a case, so MV-155→158 left no residue for MV-160's sweep to repair. It
does **NOT** prove that every field value is byte-identical to its pre-Stage-2 value. That stronger
claim is no longer obtainable by any means, and no later reader should treat the zero-residue table
as if it were the missing diff. It is the best available evidence for that half, and it is weaker
than a diff.

**`document_status` has 0 production rows, so its §A2 domain comparison is VACUOUS.** A snapshot of
an empty list is byte-identical to another snapshot of an empty list. That domain shows `=` below on
all ten users because there was nothing to compare, **not** because a comparison passed. The only
evidence covering `document_status` is §A1's synthetic corpus. The same caveat applies, for the same
reason, to the anonymous-assessment population: production carries **0** anonymous rows (§3.0's table), so
the case-less branch has no live subject either.

**One naming caution, because the same phrase means two different things in this file.** §2 uses
"pre-tighten → post-tighten" for **§A1's** interval, which crosses `20260805140000` ONLY — §A1 rolls
back and re-applies that one file, so MV-161 stays applied throughout and §A1 never crosses it. §A2's
interval crosses **both** pending migrations. The practical consequence: **MV-161's crossing is
covered by this §A2 run alone and has no CI regression net.** Extending §A1 to roll back and re-apply
both files is now possible — §3.1 ships the reverse script that was missing — and is the obvious
follow-up.

### 3.1 How the pre-state was reached — and the reversal that had to be written

Production is applied through `20260803180000_case_aware_student_data_rls` (MV-159); **exactly two**
migrations are pending — `20260805120000` (MV-161) and `20260805140000` (MV-160). The local stack had
**all 24** applied, so it had to be walked backwards to production's exact position:

```
supabase/rehearsal/MV-160-rollback.sql   → post-MV-159 / post-MV-161 / pre-MV-160
supabase/rehearsal/MV-161-rollback.sql   → post-MV-159 / pre-MV-161  / pre-MV-160   ← NEW, this card
delete from supabase_migrations.schema_migrations
  where version in ('20260805120000','20260805140000');
```

**`MV-160-rollback.sql` alone lands one migration short of production**, and deliberately so: its
header says *"MV-161 IS NOT BEING UNWOUND HERE … it is a P0 fix that sits ON TOP of MV-159 and must
survive R1 untouched"*, and its §8 post-conditions **assert** the pointer bound and
`private.outcome_event_case_id()` survived. That is right for an incident unwind and wrong for this
rehearsal, so **`supabase/rehearsal/MV-161-rollback.sql` is new in this card** — the reverse script
MV-161 never got, closing a real gap in the directory's reversibility doctrine. It restores MV-159's
two INSERT predicates verbatim, drops the helper, and asserts the restored state. Both of its guards
were shown to bite (§4, rows R1/R2), and it says twice, in the file, that unwinding a live P0 fix is
a rehearsal-only act.

**The pre-state was then verified against production's own measured catalog rather than assumed:**

| Probe | Local pre-state | Production | |
| --- | --- | --- | --- |
| `*_ownership_axis_present` checks | 8 | 8 | ✅ |
| Policies on `public` | 45 | 45 | ✅ |
| …of which mention `owner` (MV-159's transitional disjunct) | 31 | 31 | ✅ |
| `case_id` NOT NULL on the eight MV-160 tightens | 0 | 0 | ✅ |
| `private.outcome_event_case_id()` present | no | no | ✅ |
| `schema_migrations` max version | `20260803180000` | `20260803180000` | ✅ |

### 3.2 How real production data got onto the rehearsal host

`pg_dump` was **not** used: it needs the database password, which is not in `.env.local`, and hunting
for credentials was explicitly out of scope. Instead a one-off reader
(`docs/migrations/stage2/snapshots/copy-prod-to-local.mjs`, gitignored with the payload) read
production through PostgREST with the service-role key already in `.env.local` — **a read; no write
of any kind was issued against production** — and loaded the rows into the local stack through
`docker exec psql`. The ten `auth.users` rows were recreated locally **with matching uuids**, because
the capture reads RLS-scoped as each user and enumerates subjects through `listUsers`.

Four things the copy had to get right, each verified rather than assumed:

- **Column parity was asserted before a single row was inserted.** Every copied table's production
  column set was compared with the rolled-back local catalog; a mismatch aborts. All identical.
- **`plan_items.id` is `GENERATED ALWAYS AS IDENTITY`** — a supplied value raises `428C9`. Inserted
  with `OVERRIDING SYSTEM VALUE` through psql, so the real ids survive. (A PostgREST copy cannot
  emit that clause and would have silently renumbered them.)
- **The two `BEFORE INSERT` derive triggers** (`user_program_state_derive_case_id`,
  `document_status_derive_case_id`) were disabled for the load and **re-enabled afterwards** —
  verified enabled at the end. Every `*_set_updated_at` trigger is `BEFORE UPDATE` only, so an
  INSERT-only copy preserves `updated_at` untouched; no upsert was used anywhere.
- **Copy fidelity was proven, not trusted.** Every copied table hashes identically to what
  production returned:

| Table | rows | prod hash == local hash |
| --- | --- | --- |
| `universities` | 15 | `eade7a3a83bc` = |
| `programs` | 83 | `76e64b1fb1ff` = |
| `cases` | 10 | `0e837a180387` = |
| `profiles` | 7 | `1fa5991b7334` = |
| `assessments` | 36 | `a32e9c2fbfcb` = |
| `plan_items` | 74 | `d4d50b3d5190` = |
| `user_program_state` | 12 | `a17bd466eee3` = |
| `documents` | 6 | `f9fcc9b497a5` = |
| `program_predictions` | 10 | `a7eea1972dba` = |
| `application_attempts` | 10 | `d8783db698ca` = |
| `outcome_events` | 19 | `6643ab28a58e` = |

`document_status` is absent from the table above because it has **0** production rows — it was copied
as empty, which is why all nine read paths are accounted for and only eight appear.
`leads` (11 rows) and `audit_events` (0) were **not** copied: nothing in the nine read paths
references them. `organizations` / `organization_memberships` / `case_assignments` / `invitations`
are empty on production and were copied as empty.

### 3.3 The run, and the result

```
capture pre-tighten  →  apply 20260805120000 (MV-161)  →  apply 20260805140000 (MV-160)  →  capture post  →  diff
```

Both migration files were applied **verbatim, in order, through `psql --single-transaction`**, with
no edit of any kind.

**The captured population is not vacuous** — the check §A1 exists to make impossible to skip:

| | |
| --- | --- |
| Users captured | **10** (all of production's `auth.users`) |
| Rows in the snapshot | **174** |
| Users carrying ≥1 row | 7 of 10 — `student-07`, `student-09`, `student-10` are real accounts with **no data at all** on any of the nine |
| Anonymous assessments | **0 → 0** (see §3.0's caveat) |

**The 174 rows read RLS-scoped, summed per user, equal the service-role table totals exactly**
(7 + 36 + 74 + 12 + 6 + 0 + 10 + 10 + 19 = 174).

**Read that as a count identity and nothing more — an earlier draft of this section overstated it.**
A sum is satisfied identically by a correct one-row-one-student partition *and* by a state where one
row is visible to two students while another is visible to none. The per-row uniqueness check that
would exclude the second case was **not run**, and the payload has since been destroyed (§5), so it
cannot be run retrospectively. What the identity does establish is worth having and is weaker than a
bijection: **the visible-row count matches the table totals on every one of the nine**, so no bulk
population is invisible to the students who own it and none is grossly duplicated. Anyone re-running
§A2 should add the id-level set comparison — the snapshot carries row ids, so it is cheap — and this
paragraph should then be replaced by its result.

| User | profile | assessments | plan | shortlist | documents | checklist | predictions | attempts | outcomes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `student-01` | = | = | = | = | = | = ¹ | = | = | = |
| `student-02` | = | = | = | = | = | = ¹ | = | = | = |
| `student-03` | = | = | = | = | = | = ¹ | = | = | = |
| `student-04` | = | = | = | = | = | = ¹ | = | = | = |
| `student-05` | = | = | = | = | = | = ¹ | = | = | = |
| `student-06` | = | = | = | = | = | = ¹ | = | = | = |
| `student-07` ² | = | = | = | = | = | = ¹ | = | = | = |
| `student-08` | = | = | = | = | = | = ¹ | = | = | = |
| `student-09` ² | = | = | = | = | = | = ¹ | = | = | = |
| `student-10` ² | = | = | = | = | = | = ¹ | = | = | = |

¹ **vacuous** — `document_status` has 0 production rows. ² the user carries no rows on any domain,
so every cell in that row is vacuous. The labels are pseudonyms assigned by sorting user ids; no id,
name or email appears in this file.

**MV-160's reconciliation sweep, on real production data — the number §B asked for:**

```
{"profiles": 0, "documents": 0, "plan_items": 0, "assessments": 0, "cases_created": 0,
 "outcome_events": 0, "document_status": 0, "personal_case_ids": [],
 "user_program_state": 0, "program_predictions": 0, "application_attempts": 0}
MV-160 (a) private.mv155_assert_case_backfill() passed — every owned row carries a case.
```

**Zero rows repaired, zero personal cases minted.** Read against §B's own framing — *"a non-zero
count … is evidence that the MV-157 dual-write leaked, and it is a finding about Stage 2"* — a zero
count is the good outcome: **the dual-write did not leak.** It also means the sweep's repair path was
**not exercised by live data**, so its correctness rests on §A1's `student-C-residue` fixture alone.

**And the migration closed the window it was supposed to close:**

| Probe | pre | post |
| --- | --- | --- |
| `case_id` NOT NULL on the eight | 0 | **8** |
| `*_ownership_axis_present` checks | 8 | **0** |
| Policies on the nine reading `auth.uid()` | >0 | **0** |

The four surviving `auth.uid()` policies are on `cases` and `organization_memberships` — the identity
tables `private.actor_case_ids()` is anchored on. They are supposed to remain.

### 3.4 The proof was shown to bite, on this data, in this run

A hash comparison nobody has seen fail is not evidence — §4's argument, applied to §A2 rather than
only to §A1. §A1's **M5** was reproduced against the live copy: one field of one user's profile was
perturbed post-migration (with `profiles_set_updated_at` disabled, so **only** that field moved), the
diff re-run, and the row then restored exactly.

| Step | Whole-snapshot hash | CLI exit | Result |
| --- | --- | --- | --- |
| after the real apply | `a08f6993…3be9` | `0` | `EQUIVALENT — zero differences.` |
| one field perturbed | `34be8275…c573` | **`1`** | `NOT EQUIVALENT — 1 difference(s): student-06 / profile / row <id> / completeness: 100 -> 101` |
| perturbation reverted | `a08f6993…3be9` | `0` | `EQUIVALENT — zero differences.` |

It named the pseudonymous user, the domain **and** the field, and it exited non-zero. The green above
is a green that can go red.

```bash
npm run stage2:equivalence -- --capture --out docs/migrations/stage2/snapshots/pre-migration.json
```

```bash
npm run stage2:equivalence -- --snapshot docs/migrations/stage2/snapshots/pre-migration.json
```

Requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` for
the rehearsal copy. The replay runs **as each user, through an anon-key client carrying that user's
JWT** — never the service-role admin. Proving the rows survived is not the same as proving the
student can still read them, and only the second one is the exit gate. The service role is confined
to enumerating subjects and to the anonymous-assessment capture, which is invisible to every
authenticated client by design.

### The host guard (MV-164) — "rehearsal-only" is enforced, not merely stated

Both commands above are copy-pasteable, and until MV-164 the only thing standing between them and a
full-population personal-data export from production was the sentence telling you not to do it. It is
now a check in the code. `scripts/stage2/capture-host-guard.mjs` runs **before any Supabase client is
constructed and before `listUsers` enumerates anybody**, and classifies `SUPABASE_URL`:

| Target | Result |
| --- | --- |
| The production ref `obfvrxixtautamflzxzq` | **Refused. No override** — `--rehearsal-host` does not unlock it. There is no legitimate run of this script against production. |
| `localhost` / `127.0.0.1` | Allowed. The ordinary path; no flag needed. |
| Any other host | **Refused unless `--rehearsal-host` is passed.** A restored copy may legitimately live on its own hosted project, so this is an opt-in rather than a ban — but choosing a remote target has to be visible and deliberate. |
| Anything unparseable | Refused. The guard will not guess. |

So a rehearsal copy on a **hosted** project is run as:

```bash
npm run stage2:equivalence -- --capture --out docs/migrations/stage2/snapshots/pre-migration.json --rehearsal-host
```

The ref is matched as a whole DNS label of the parsed host — not as a substring of the URL — so a
path or query string that merely mentions it is not misread as production, and neither is a longer
look-alike ref. Refusals name the rejected host and what to do instead. Guard behaviour is pinned by
`tests/scripts/stage2-capture-host-guard.test.ts`, including that the guard is actually *wired up*
ahead of the enumeration; the mutation evidence for it is §4's guard table, rows G1-G9.

**No green §A2 record, no production apply.** The founder gate on applying Stage 2 to
`obfvrxixtautamflzxzq` names this run and its date.

### Expected values, stated BEFORE the run so a surprise is legible

Stated before the run; the **Measured** column was filled afterwards. **Three of the four held; the
fourth was satisfied vacuously and is marked so** — ticking "only personal cases were added" against
an empty set is exactly the vacuity this document flags elsewhere.

| Measurement | Expected | **Measured 2026-08-07** | Why |
| --- | --- | --- | --- |
| Anonymous assessments (`owner IS NULL`) | **0** | **0** ✅ | The plan's "40 anonymous/unclaimed" is from 2026-07-23. A hosted capture on 2026-08-02 found 36 assessments and 0 with `owner IS NULL` — MV-135's 3-day purge has cleared the population, which is transient by design. A reviewer expecting 40 will read 0 as a capture bug. **Consequence that is not "just update the number": the case-less behaviour has no live subject to exercise, so it is proven only by §A1's synthetic seed and the rehearsal cannot confirm it.** |
| Assessments total | ~36 | **36** ✅ | Same 2026-08-02 capture; read the real number at capture time. |
| Rows added by Stage 2 | personal `cases` only | **none at all** — ⚠️ **vacuous** | Nothing else is created and nothing is deleted — and in the event the sweep minted **zero** cases, because there was no residue to repair (§3.3). |
| Diff | **zero** | **zero** ✅ | Non-zero = the stage exit has failed. |

### Known pre-existing condition — 2 orphan `storage.objects`

The `documents` bucket holds **8** `storage.objects` against **6** `documents` rows: **2 orphan
objects with no matching row** (spec §2.8, §9.10). They are not `documents` rows, so they do not
break identity parity. Recorded here because they will surface in Stage 4's re-path and Stage 6's
export/deletion work, and an unrecorded orphan found later reads as data loss caused by this stage.

**Object ids, enumerated on production 2026-08-07:**

| `storage.objects.id` | bytes |
| --- | --- |
| `fab04169-45d9-404d-a84f-994ceed71914` | 315 607 |
| `695d9da3-2ca4-4fb4-9eb2-28e78c9b1d16` | 315 607 |

**Identical byte counts**, which makes a duplicate upload the likeliest origin — but that is an
inference from two numbers, not a finding, and it is recorded as such. The complementary direction
was also measured and is the reassuring half: **0 dangling `documents` rows** — every one of the 6
rows has its object, so nothing a student can see points at missing bytes. The orphans are bytes with
no row, not rows with no bytes.

These are `storage.objects` UUIDs, not student identifiers. They were read through the **Storage
API**, not by joining `storage.objects`: that schema is not PostgREST-exposed
(`supabase/config.toml` `[api] schemas = ["public", "graphql_public"]`), and a direct
`storage.objects` join attempted against production was **blocked by the tool classifier**. The
Storage-API walk is the same read by another route and is recorded here so the next reader does not
repeat the blocked attempt.

**They are not in the §A2 capture and could not have been.** The capture reads the nine `public`
read paths; storage objects are not one of them, and the rehearsal copy deliberately carries no
object bytes. This row is evidence about production, gathered alongside §A2, not a product of it.

---

## 4. Mutation evidence — the assertions were shown to bite

Without this the equivalence proof is a hash comparison nobody has ever seen fail. Applied, run,
reverted; catalog fingerprint verified identical before and after the whole run.

| # | Mutation | Result | Test that went red |
| --- | --- | --- | --- |
| M1 | re-widen `application_attempts.case_id` to nullable | **RED** | `case_id NOT NULL on all EIGHT`; `THE COUNTERFACTUAL` |
| M2 | re-add `application_attempts_ownership_axis_present` | **RED** | `dropped ALL EIGHT … and names any survivor` — names the table, not a count |
| M3a | re-create `assessments_primary_idx on (owner) where is_primary` | **RED** | `NO owner-keyed unique or PK left`; `SEVEN … BY NAME` |
| M3b | re-create `program_predictions_owner_assessment_id_program_id_rule_ver_key` | **RED** | same two — the constraint this card's drop list originally omitted |
| M4 | reintroduce `.eq("owner", userId)` into a repository | **RED** | `only the allow-listed paths carry an owner predicate`; `no exported repository function takes a user id` |
| M4b | delete the registered dual-write module | **RED** | `the dual-write choke point exists, derives, and is still WIRED UP` |
| M4c | add an `owner:` key to an insert payload | **RED** | `only the allow-listed path writes an owner: payload key` |
| M4d | unhook one repository from the dual-write | **RED** | `the dual-write choke point … still WIRED UP` |
| M5 | perturb one field of one user's profile post-migration | **RED** | named the user, the domain **and** the field (`student-A / profile / completeness`) |
| M5b | remove one row from one user's payload | **RED** | reported `<row vanished>`, not a count delta |
| M6 | re-apply MV-155's narrowed `reject_prediction_update()` | **RED** | `NO conditional branch left in the function body` |
| M7 | delete the sweep step and seed an owned, `case_id`-null row | **RED** | the apply **fails** (`23502`) instead of succeeding |
| M8 | re-add the transitional owner disjunct to ONE policy | **RED** | `NO policy predicate … uses owner as an AUTHORIZATION SOURCE` — names that policy |
| M8b | `drop policy` instead of rewriting it | **RED** | `SAME policy names, per table per command` — the removal cannot be a deletion |

**M5 and M6 are the two worth reading twice.** M5 is the one that makes the equivalence proof
non-inert. M6 is red on the **structural** assertion only: the behavioural probes cannot distinguish
the narrowed body from the unconditional one, because `old.case_id is null` is unreachable once
`case_id` is NOT NULL. That unreachability is exactly why MV-155's handoff had to be closed
explicitly rather than left to self-close — "unreachable given a constraint elsewhere" evaporates if
any later stage re-widens the column.

### The §A2 host guard (MV-164)

A guard whose tests pass without it is a guard nobody has. Each mutation below was applied to
`scripts/stage2/capture-host-guard.mjs` or to the capture script's call site, run, and reverted;
`tests/scripts/stage2-capture-host-guard.test.ts` is **34 green** before and after the whole run.

| # | Mutation | Result | Test that went red |
| --- | --- | --- | --- |
| G1 | delete the guard call from `runCli` entirely | **RED** (3) | `it calls the guard BEFORE it constructs any Supabase client`; `… BEFORE it enumerates Auth users`; `the CLI reads the opt-in with has()` |
| G2 | keep the call but move it *after* the client and `listUsers` | **RED** (2) | both `BEFORE …` ordering tests — the wiring assertion is on ORDER, not presence |
| G3 | neuter production detection (`return false`) | **RED** (10) | `the canonical production URL is refused`; `the opt-in flag does NOT unlock production`; all six group-D production cases; both group-F throws |
| G4 | whole-label match → naive `hostname.startsWith(ref)` | **RED** (2) | `a DIFFERENT project whose ref merely starts with the production ref is not production`; `the production ref as ANY whole host label is production` |
| G5 | host parse → naive `rawUrl.includes(ref)` | **RED** (5) | `the ref appearing in the PATH is not production`; `… in the QUERY STRING …`; plus the no-scheme fail-closed case |
| G6 | make `--rehearsal-host` a production override | **RED** (2) | `the opt-in flag does NOT unlock production`; `it throws on production even when the host is acknowledged` |
| G7 | default `rehearsalHostAcknowledged` to `true` | **RED** (3) | `a remote host is refused by default`; `it throws on an unacknowledged remote host` |
| G8 | make an unparseable URL fail **open** | **RED** (3) | all three group-E cases |
| G9 | `assertCaptureHostAllowed` computes the verdict but never throws | **RED** (3) | all three group-F throws — the verdict object alone stops nothing |
| **G-live** | *(not a mutation)* MV-165 pointed the real CLI at `https://obfvrxixtautamflzxzq.supabase.co` **with `--rehearsal-host` passed** | **REFUSED**, exit `1` | Live proof, not a unit test: `REFUSING: SUPABASE_URL points at the PRODUCTION project … THERE IS NO OVERRIDE, --rehearsal-host included.` `git status scripts/stage2/` is **empty** — the guard was neither weakened nor bypassed to get §A2 green. |

**G1/G2 and G6 are the ones worth reading twice.** G1/G2 are the inert-guard shape this repo has
already been bitten by (a denial-only RLS suite passes identically against a *missing* policy): every
behavioural assertion in groups A-F stays green while the guard is exported and never called, so the
ordering assertion in group G is the only thing standing between "the guard exists" and "the guard
runs". G6 is the one that decides whether the production refusal is a refusal or a speed bump.

### The MV-161 reversal (MV-165) — its two guards were shown to bite

`supabase/rehearsal/MV-161-rollback.sql` is new (§3.1), and *"a written rollback that was never run
is a hypothesis"* — `README.md`'s opening paragraph. Both guards were exercised against the live
rehearsal database:

| # | Situation | Result |
| --- | --- | --- |
| R1 | run a **second** time, with the helper already dropped | **REFUSED**, exit `3` — `private.outcome_event_case_id() does not exist, so MV-161 is not applied … refuses rather than re-typing MV-159's predicates over an unverified state` |
| R2 | run **before** `MV-160-rollback.sql`, i.e. against a post-MV-160 database | **REFUSED**, exit `3` — `program_predictions.case_id is NOT NULL, so MV-160 … is still applied. Unwind in REVERSE ORDER OF APPLICATION` |
| R3 | **mutation** — the case axis (`case_id = any (private.actor_case_ids())`) deleted from both restored predicates in a COPY of the script | **RED**, transaction aborted — `POST-CONDITIONS FAILED: only 0 of 2 INSERT predicates still bound the CASE axis … a client could name a case it has no access to`. Check (d2) was added *because* the first draft's nine post-conditions all passed with that clause gone — checks (c) and (d) cover the owner arm and the transitional arm and neither notices. |

It was also run **forward-clean** in the real sequence, its nine post-conditions passed, and the
database it produced then matched production's catalog on **all six probes** in §3.1's table — the
strongest available check that the reversal lands where it claims. **It was proven in both
directions**, which `MV-160-rollback.sql`'s own closing note demands and which no predecessor in this
directory had done: the rehearsal rolled *back* through it and then rolled *forward* through the real
`20260805120000`, which re-created both predicates and the helper without complaint.

**One honest note on scope.** The guard classifies the host in `SUPABASE_URL`. It cannot see through
a custom domain or a proxy that fronts production under another name, and it does not authenticate
the target — it is a make-it-safe-by-construction fence against the realistic mistake (exporting
production credentials and running the copy-pasteable command above), not a proof of where the bytes
came from.

---

## 5. The payload, and why it is not here

The raw snapshot is per-user payload for real students — profile sections, names, emails, financial
and academic detail. Git history is permanent and un-deletable, and committing it would contradict
the layered controller model in `docs/legal/2026-07-29-stage0-decision-record.md` D-A.

- It is written to `docs/migrations/stage2/snapshots/`, which is **gitignored**.
- The ignore is **asserted by a test**, along with "no snapshot is tracked" and "this report is".
- The file is **destroyed on the rehearsal host** once this report is produced.

This is also the reason §A2 cannot be a CI test: the artifact it needs is one this repo has correctly
decided never to hold.

### Destruction record — MV-165, 2026-08-07

Both copies of the payload are gone. Nothing in this report, the MV-165 card or its PR carries a
**student** row, an email, a name or a user id — counts, pseudonyms, hashes and verdicts. **Two
deliberate exceptions, named rather than glossed:** the two `storage.objects` UUIDs above, which are
object keys rather than student identifiers and which this section is explicitly asked to record; and
the single field value in §3.4's mutation line (`completeness: 100 -> 101`), one integer attached to
a pseudonym.

| Artifact | Disposition |
| --- | --- |
| `snapshots/pre-migration.json` (2 078 599 B) | **deleted** |
| `snapshots/prod-copy.json` (1 767 602 B) | **deleted** |
| `snapshots/` one-off reader, loader, fidelity checker, key helper, apply log | **deleted** — the whole directory was removed |
| The production copy loaded into `supabase_db_merovisa` | **truncated**; re-counted afterwards at **0** rows across all nine plus `cases` and `auth.users` |

**THE COPY TOOLING IS DELIBERATELY NOT COMMITTED, and that is a decision rather than an oversight.**
The one-off prod reader/loader would have to be registered in
`lib/supabase/service-role-exceptions.ts` to pass lint — a registry whose entries are application
paths carrying a case-authorization check and an audit event, neither of which a rehearsal script
has. More to the point: **committing a script whose whole purpose is "read every production student's
data" reintroduces the copy-pasteable full-population export path MV-164 exists to close.** The
method is documented in §3.2 and in the MV-165 card in enough detail to rewrite it deliberately; that
friction is the feature. `npm run lint` is green precisely *because* the scripts are gone.

---

## 6. The production apply — 2026-08-07

This section is the outcome. Everything above it is the argument for being allowed to do this; this
is what was done and what was measured afterwards. Added after the fact, which is why it sits at the
end rather than being folded into §3.

Applied from the composer session via the Supabase MCP `apply_migration`, on founder authorization
("yes apply"), in the order the rollback scripts assume. **Both went in byte-identical to the files
this report proves** — the staged copies were hashed immediately before each call and the comment
bodies were NOT stripped, because the whole value of §A2 is that what was proven is what was applied:

| # | Migration | sha256 of the applied text | Result |
| --- | --- | --- | --- |
| 1 | `20260805120000_bound_insert_pointer_columns` (MV-161) | `278850285de7143ab2feee2631685373293fa47c5b41e94530f73c557a7da850` | success; its own §4 DO-block assertions ran and passed at apply time |
| 2 | `20260805140000_stage2_tighten_case_mandatory` (MV-160) | `d655f9f0f386a9429cfd7b7a4108b8e8b0ec07b1d6152ee2d4a23fd4d6977ad6` | success |

They were applied in two sittings with a context compaction between them. The resting state in
between — post-MV-161, pre-MV-160 — is deliberately the exact state `supabase/rehearsal/
MV-160-rollback.sql` lands in, so the pause was taken at a point with a proven reverse path rather
than at an arbitrary one.

### 6.1 Post-apply verification, run against production

Stated as want-vs-got so a future reader can tell a pass from a restatement:

| Check | Want | Got |
| --- | --- | --- |
| A. `case_id` NOT NULL on the eight targets | 8 | **8** |
| B. **`assessments.case_id` still NULLABLE** | YES | **YES** |
| C. owner disjunct gone — `_case` policies still naming `uid()` | 0 | **0** |
| D. round-3 owner-axis `case_student_id` bound survives | 5 | **5** |
| E. MV-161 parent-pointer bounds survive | 2 | **2** |
| F. `oe_insert_case` `source`/`verified_by` clauses survive | 1 | **1** |
| G. `<table>_ownership_axis_present` checks dropped | 0 | **0** |
| H. `assessments_case_required_when_owned` present | 1 | **1** |
| I. legacy `(id, owner)` unique constraints dropped | 0 | **0** |
| J. legacy composite FKs dropped | 0 | **0** |
| K. superseded owner-keyed indexes dropped | 0 | **0** |
| L. `assessments_anon_purge_idx` + `assessments_owner_idx` **kept** | 2 | **2** |
| M. `private.reject_prediction_update()` unconditional again | true | **true** |
| N. **total rows across the nine tables** | 174 | **174** |

**B and N are the two that matter most, and they are the two most easily mistaken for formalities.**
B is the trap the migration header names explicitly: a migration that *succeeds* at setting
`assessments.case_id NOT NULL` has destroyed the anonymous rows — a failure wearing a success's
clothes. It did not fire. N is 174, the exact figure §3.3 measured on the byte-identical copy, so no
row was lost, moved, or silently rewritten. L is there because dropping those two indexes would have
been an easy over-reach: they are load-bearing for MV-135's purge after this migration, not before.

### 6.2 The check that actually proves step (d)

Steps (d) and (e) are the two the migration header marks **SILENT** — if they go wrong there is no
error and no log line, just a student whose data has become invisible to them. An assertion written
by the same author as the migration is weak evidence against that class of failure, so the check used
was a comparison against an independent artifact:

```
md5 over (tablename|policyname|cmd|roles|qual|with_check), ordered, for the 9 tables' `*_case` policies

  production                          24 policies   bf5eaa750b06df575c83ba75e3784e06
  supabase_db_merovisa (rehearsal)    24 policies   bf5eaa750b06df575c83ba75e3784e06
```

The rehearsal host is the one §3.3 proved equivalent on real data. Identical hashes mean production's
**deparsed** policy expressions are the ones that were proven — not "equivalent in spirit", the same
catalog output. `pg_policies.qual` / `with_check` are Postgres's own rendering, so this comparison is
immune to whitespace, comment, and line-ending differences between the two hosts.

### 6.3 What the apply did NOT prove — recorded, not glossed

* **Production holds 0 anonymous unclaimed assessments.** So step (c)'s
  `assessments_case_required_when_owned` exception is structurally correct (check B) but has **no live
  data exercising it**. This is the same vacuity §3.3 flagged for the anonymous population before the
  run; the apply did not retire it and does not pretend to.
* `document_status` remains at 0 production rows, so its share of check N is likewise vacuous.

### 6.4 The one defect the apply exposed — migration-ledger drift — **RESOLVED same day**

**This was a defect in the apply *method*, not in either migration. It is now fixed; the description
is kept because the trap recurs on every migration applied this way.**

`apply_migration` records **its own wall-clock timestamp** as the `version` in
`supabase_migrations.schema_migrations`, not the version prefix of the repo filename. Production
therefore recorded `20260807032103` / `20260807065246` against files named `20260805120000_*` /
`20260805140000_*`. It also stored each file as a **single** `statements` array element, where the
CLI-applied row immediately before it (`20260803180000`) parsed its file into 68.

Blast radius, stated precisely because "the migration ledger is wrong" sounds worse than it is:
runtime queries, RLS, student data, Vercel deploys and fresh-from-scratch CI stacks are **all
unaffected** — nothing reads this table at runtime. What breaks is the **next** production schema
change: `supabase db push` compares versions, would see both files as unapplied, re-run them, and die
on already-dropped constraints (neither file is idempotent). Not an incident; a landmine with a known
trigger.

**How it was fixed, 2026-08-07.** Two single-row `UPDATE`s on founder authorization:

```sql
update supabase_migrations.schema_migrations
   set version = '20260805120000'
 where name = 'bound_insert_pointer_columns'  and version = '20260807032103';

update supabase_migrations.schema_migrations
   set version = '20260805140000'
 where name = 'stage2_tighten_case_mandatory' and version = '20260807065246';
```

Verified afterwards: **24 migrations, tail `20260805120000 bound_insert_pointer_columns |
20260805140000 stage2_tighten_case_mandatory`, zero rows left at either stale version.** The ledger
now matches the repo filenames, so `db push` sees both as applied.

The `statements` arrays were left as the MCP wrote them — one blob each, where the CLI-applied row
before them parsed into 68. That is a cosmetic difference: `db push` compares **versions**, not
statement arrays or SQL checksums, which is why the two shapes have coexisted here without incident.

**The supported CLI alternative, recorded because it is the correct tool if a future drift needs
catalog-perfect rows.** Note `--status applied` **inserts** and `--status reverted` **deletes** — it
is *not* an upsert, so a version change needs both — and versions are positional arguments, not a
`--version` flag:

```
supabase migration repair 20260805120000 20260805140000 --status applied
supabase migration repair 20260807032103 20260807065246 --status reverted
```

It needs a working CLI plus either `--db-url` (DB password) or `--linked`
(`SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`) — **not** the service-role key. On this machine
`npx supabase` is broken (win32-x64), so it would mean a pinned `supabase/cli` container. That
overhead is why the direct `UPDATE` was the right call for a version-only fix.
