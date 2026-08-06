# Stage 2 data-equivalence report (MV-160 §A)

**Status: §A1 GREEN · §A2 NOT YET RUN — the production apply stays founder-gated on it.**

The Stage 2 exit gate is *"existing students see the same correct data, while case-scoped
repositories no longer depend on actor equals student"* (consultancy plan line 637). This file is
where the first half is evidenced. It is the **pseudonymous** artifact: per-user labels, per-domain
hashes, counts and verdicts. The payload it summarises is real student personal information and is
never committed — see §5.

| | |
| --- | --- |
| Card | `docs/kanban/cards/MV-160-tighten-stage2-exit.md` §A |
| Spec | `docs/superpowers/specs/2026-08-02-stage2-migration-and-access-matrix.md` §9.2, §9.10, §10.1 R1 |
| Shared comparison | `scripts/stage2/capture-read-path-snapshot.mjs` — one serializer, one hash, one exclusion list |
| §A1 (synthetic, CI) | `tests/integration/stage2-data-equivalence.itest.ts` |
| §A2 (live, rehearsal) | `npm run stage2:equivalence -- --snapshot <path>` |

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
whole-stage boundary would need reverse scripts for MV-155/156/158/159 that do not exist. That is
§A2's job, and it is why §A2 is the exit gate and §A1 is the regression net.

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

---

## 3. §A2 — live-data replay: **NOT YET RUN**

- **Verdict:** _pending_
- **Date:** _pending_
- **Run by:** _pending — the integrator, on the rehearsal host, not the agent and not CI_
- **Snapshot captured before MV-155 first mutated the copy:** _to be confirmed by the integrator_

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

**No green §A2 record, no production apply.** The founder gate on applying Stage 2 to
`obfvrxixtautamflzxzq` names this run and its date.

### Expected values, stated BEFORE the run so a surprise is legible

| Measurement | Expected | Why |
| --- | --- | --- |
| Anonymous assessments (`owner IS NULL`) | **0** | The plan's "40 anonymous/unclaimed" is from 2026-07-23. A hosted capture on 2026-08-02 found 36 assessments and 0 with `owner IS NULL` — MV-135's 3-day purge has cleared the population, which is transient by design. A reviewer expecting 40 will read 0 as a capture bug. **Consequence that is not "just update the number": the case-less behaviour has no live subject to exercise, so it is proven only by §A1's synthetic seed and the rehearsal cannot confirm it.** |
| Assessments total | ~36 | Same 2026-08-02 capture; read the real number at capture time. |
| Rows added by Stage 2 | personal `cases` only | Nothing else is created and nothing is deleted. |
| Diff | **zero** | Non-zero = the stage exit has failed. |

### Known pre-existing condition — 2 orphan `storage.objects`

The `documents` bucket holds **8** `storage.objects` against **6** `documents` rows: **2 orphan
objects with no matching row** (spec §2.8, §9.10). They are not `documents` rows, so they do not
break identity parity. Recorded here because they will surface in Stage 4's re-path and Stage 6's
export/deletion work, and an unrecorded orphan found later reads as data loss caused by this stage.

**Object ids: _to be filled from the rehearsal capture_** — they live on the hosted project and were
not enumerated in the spec, only counted.

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
