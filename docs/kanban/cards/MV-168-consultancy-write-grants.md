# MV-168 — Stage 3 slice 1: the consultancy write grants, and retiring MV-160's `42501` pin in the same PR

**Priority:** P1   **Owner:** agent
**Goal:** Ship the **only SQL in Stage 3** — the `INSERT` grants + policies on `profiles` and `plan_items` and a narrowed `UPDATE (is_primary)` grant + policy on `assessments` — **and the three `.upsert()` → read-then-insert conversions without which those grants never reach their own call sites.** Retire MV-160's `42501` deferral pin in the same PR, and amend the Stage 2 spec.

**Authoritative spec:** `docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md` (§2.3, §6.1, §8.1, §8.2). **Where this card disagrees with the spec, the spec wins. If the implementation contradicts the spec, amend the spec IN THIS PR** (spec §1 rule 2 — the prose version of this instruction failed twice running in Stage 2).

## Why this is the prerequisite slice, not a late one

Nothing can be written into a student-less consultancy case until these land. Every write MV-171 and MV-172 need on `profiles` and `plan_items` is `42501` through the authenticated client today. The schema work is **already done** — `owner` is nullable on all nine student-owned tables and every uniqueness index is keyed on `case_id`, not `owner` (spec §2.5, §2.6). **Stage 3 needs grants and policies, not a migration.**

## Scope — three SQL changes and three TypeScript conversions

### A. The grants and policies (spec §6.1 rows 1, 3, 5)

| # | Table | Verb | Grant | Policy |
|---|---|---|---|---|
| 1 | `profiles` | INSERT | `INSERT (owner, case_id, sections, completeness)` | `profiles_insert_case` |
| 3 | `assessments` | UPDATE | `UPDATE (is_primary)` — **narrowed, not whole** | `assessments_update_case` |
| 5 | `plan_items` | INSERT | `INSERT (owner, case_id, kind, impact, title, body, status, lift_estimate, time_estimate)` | `plan_items_insert_case` |

**Every INSERT policy carries the five-sibling `WITH CHECK` template verbatim** (spec §2.3 — already written five times as `ds_insert_case`, `ups_insert_case`, `pp_insert_case`, `aa_insert_case`, `oe_insert_case`):

```
case_id IS NOT NULL
AND case_id = ANY (SELECT private.actor_case_ids())
AND (owner IS NULL OR owner = private.case_student_id(case_id))
```

**That third conjunct is the consultancy-row clause and omitting it is the bug.** It is what lets a row exist with `owner IS NULL` for a case with no student while forbidding a row that names *someone else's* user id. The naive grant — table-wide, no `owner` conjunct — would let any actor write rows attributed to another user.

**Why `assessments` UPDATE is narrowed to `is_primary`:** `result` and `rule_version` are scoring outputs. A client that can write them can **mint its own verdict** against the server-side scoring rule, which is the exact trust property this product sells. `is_primary` is a *user choice* already governed by the partial unique `assessments_case_primary_idx`. `app/api/assess/refresh/route.ts` keeps its re-score on service-role.

### B. The three `.upsert()` conversions — the grants are inert without these

**This is the correction that the MV-166 revision added; do not skip it.** PostgREST compiles `.upsert()` to `INSERT … ON CONFLICT DO UPDATE SET` and puts **every payload column in the SET list, including the conflict target**, with the privilege check at plan time — so **the insert branch raises `42501` on the FIRST call, with no row present.** Measured by MV-155 and written into `supabase/migrations/20260802120000_stage2_case_id_and_personal_cases.sql:630-640`. Granting `UPDATE (case_id)` would fix it and is **forbidden by design** (`:602-604`, *"THE ASYMMETRY IS THE POINT AND IT IS NOT A SLIP"*). **Do not weaken that rule.**

| Call site | Today | Change |
|---|---|---|
| `lib/profiles/repo.ts:84` `upsertProfileForCase` | `.upsert(payload, { onConflict: "case_id" })` | read-then-insert, `23505` as resolve |
| `lib/matches/repo.ts:50` `upsertProgramState` | `.upsert(…, { onConflict: "case_id,program_id" })` | same |
| `lib/documents/status-repo.ts:73` `setObtained` | `.upsert(…, { onConflict: "case_id,kind" })` | same |

**Two traps, both load-bearing:**

1. ~~**`upsertProfileForCase` already treats `23505` as the residue signal**~~ — **CORRECTED AT BUILD: the trap does not exist.** `profiles_owner_key` is **not** live; MV-160 §D dropped it (it is in that card's own `DROPPED_OWNER_UNIQUES`) and made `profiles.case_id` NOT NULL in the same migration, so `adoptOwnerKeyedResidue(db, "profiles", …)` can only return 0 — as `tests/integration/case-data-access.itest.ts` already pinned. Read from the live catalogue, `profiles` carries only `profiles_case_idx` and `profiles_pkey`. So `23505` has ONE meaning here and one remedy, and the adopt call is dropped from this path. The instruction came from `repo.ts`'s own doc comment, which was accurate when written and stale by MV-160. **A prose claim about the schema is evidence about the past.**
2. **The two seam writers call `caseUpsertColumns`** (`lib/cases/dual-write.ts:153-160`), which returns `null` for any case with no `student_user_id` — so they **refuse a consultancy case outright today**. Its doc-comment records this as *"a Stage 3 input"* (`:147-151`). The conversion must move them onto an ownership helper that permits `owner: null` (`caseWriteColumns` already returns it legitimately — `:116`) and supply `case_id` explicitly, which is legal on INSERT because `case_id` is in every INSERT grant.

**Verified at build, not assumed:** `pg_get_functiondef` shows `mv155_derive_case_id_from_owner` qualified `if new.case_id is null and new.owner is not null`. **MV-159 added that qualifier**, so a supplied `case_id` skips the derive branch and is respected. Three doc comments (`dual-write.ts`, `matches/repo.ts`, `status-repo.ts`) still said the trigger *"overwrites any supplied value"* — true at MV-155, false since. That staleness is what made the seam look inexpressible: under it, an owner-bearing row on an ORG case would be re-pointed to the owner's personal case. It is not. All three corrected; the personal-case path is unchanged (full unit + integration suites green).

### C. Retiring MV-160's `42501` pin (spec §6.1)

**The pin is ONE test holding FOUR assertions**, not eight: `tests/integration/stage2-tighten.itest.ts`, the test named *"DEFERRED HALF — INSERT into profiles/assessments/plan_items/documents is 42501, and that is a DECISION GATE"* (assertions at lines 945, 956, 961, 971). **The file's other two `42501` assertions (lines 775, 783) are cross-case policy tests and must NOT be touched** — a slice that "cleans up the 42501 assertions" and takes those has broken a different guarantee.

Four steps, all in this PR:

1. Add the two INSERT grants + policies and the narrowed `assessments` UPDATE grant + policy.
2. **Delete the `profiles` and `plan_items` assertions and re-add them inverted**, as positive assertions in the Stage 3 suite (the counsellor INSERT now *succeeds* with `owner IS NULL`).
3. **Leave the `assessments` and `documents` assertions in place and green**, and rewrite the test's header comment to say *refused (assessments)* and *deferred to Stage 4 (documents)* rather than *deferred to Stage 3* — otherwise the comment becomes the lie the test was built to prevent.
4. Amend Stage 2 spec §6 rows 1–7 and add a dated §12 entry.

## Explicitly NOT in scope

- **No UI, no route.** Route *signature* changes (the explicit case id) are **MV-172**, not here.
- **No `assessments` INSERT** — refused permanently (spec §6.1 row 2). **No `documents` INSERT** — deferred to Stage 4 (row 7).
- **No schema change.** No column added or altered. Grants and policies only.
- **No `UPDATE (case_id)` grant on any table, ever.**
- Do not touch `cases_insert_admin` (MV-159's refusal stands) or the `cases` column guard (that is F-3, a founder decision).

## Acceptance criteria

- [x] **The three grants and three policies exist**, each INSERT policy carrying the full three-conjunct `WITH CHECK` of spec §2.3 — verified by reading `pg_policy` back, not by reading the migration file.
- [x] **A counsellor assigned to a student-less case INSERTs a `profiles` row and a `plan_items` row through the AUTHENTICATED client, with `owner IS NULL`**, and the row is read back.
- [x] **The same INSERT naming another user's id as `owner` is refused** (`42501` / RLS violation). This is the third conjunct doing its job; without a negative test the conjunct is unproven.
- [x] **`assessments` INSERT and `documents` INSERT still raise `42501`** through the authenticated client — the two DEFERRED HALF assertions that stay.
- [x] **`assessments` UPDATE succeeds for `is_primary` and is refused for `result`** through the authenticated client. The refusal is the point of narrowing.
- [x] **The authenticated client creates a FIRST-EVER `profiles` row for a case it may reach** — a test that **fails against the `.upsert()` form** and passes after the conversion. Without this, grant 1 ships inert.
- [x] **`setObtained` and `upsertProgramState` succeed on a case with `student_user_id IS NULL`.** Today `caseUpsertColumns` refuses both. Assert **the row exists**, read back — never that the call "did not throw": both return `false` rather than raising.
- [x] **No personal-case regression.** The existing service-role callers of all three converted helpers still work: profile save, plan generation, checklist tick, shortlist write. `npm test` + `npm run test:integration` green.
- [x] **The residue path still works** — a `23505` on `profiles_owner_key` still adopts and retries; a `23505` on `profiles_case_idx` resolves without adopting.
- [x] **MV-160's pin retired per the four steps**, with the header comment rewritten and lines 775/783 untouched.
- [x] **Stage 2 spec §6 amended + dated §12 entry**, recording the three departures (assessments INSERT refused; assessments UPDATE narrowed; documents INSERT deferred to Stage 4).
- [x] **Spec §6.1 amended in THIS PR if anything above contradicted it** (spec §1 rule 2). If nothing did, say so explicitly on this card — silence is not a discharge.

## Test plan

Unit tests cannot exercise RLS. **`npm run test:integration` is mandatory** — it self-hosts its own Supabase stack and is genuinely gating in CI.

- **Positive, real-DB, as `authenticated`:** counsellor on a student-less case INSERTs `profiles` + `plan_items` with `owner IS NULL`; assert JWT `role` is `authenticated` (a test run as `service_role` bypasses every policy and proves nothing).
- **Negative, real-DB:** `owner` = another user's id → refused. `case_id` outside `actor_case_ids()` → refused. `assessments`/`documents` INSERT → still `42501`. `assessments` UPDATE `result` → refused.
- **The conversion tests:** first-ever `profiles` row via authenticated client (fails pre-conversion); `setObtained` / `upsertProgramState` on a student-less case (fails pre-conversion, and fails *silently* — assert the row, not the absence of a throw).
- **Regression:** full `npm test` + `npm run test:integration`; the personal-case journey must be untouched.
- **Board integrity:** `node docs/kanban/build.mjs` exits 0. **Use `node docs/kanban/build.mjs`, not `npm run board`** — no worktree here has usable `node_modules`.

## Integration gate

- `npm run typecheck` · `npm run lint` · `npm test` · **`npm run test:integration`**
- `node docs/kanban/build.mjs` exits 0.
- Branch `mv-168-consultancy-write-grants` → PR against `master`. **`master` IS production (Vercel auto-deploys). The merge is FOUNDER-GATED — open the PR and stop. Never `--admin`.**

## Dependencies / blocked-by

- **Not blocked.** MV-168 is the root of the Stage 3 DAG; it has no predecessor.
- **Not blocked by F-1.** F-1 gates MV-171 only. MV-168, MV-169 and MV-170 are all safe to build before the founder rules on it.
- **Not blocked by F-3.** F-3 is a second open founder decision and gates nothing in the build — but **no slice may close it**, and this one does not touch the `cases` column guard.
- **Not blocked by the D-B legal gate.** D-B gates real-data *onboarding* (Stage 7's pilot), not construction. This slice runs entirely on seeded test data.

## Risk notes

- **The grant lands on production before any caller exists.** For one or more deploys `authenticated` holds an INSERT nobody calls. That is safe **only because** the policy carries the five-sibling `WITH CHECK`: the actor must already reach the case, and `owner` must be NULL or the case's own student. A student gains the ability to insert their own `profiles`/`plan_items` rows directly via PostgREST — rows they can already create through the app's routes, in a case they already own. **The acceptance criteria must pin this explicitly** (spec §8.2).
- **The biggest failure mode is shipping the grants without the conversions.** Everything would look green — the migration applies, the policies read back correctly, and the grant is simply never reachable from the one code path that needs it. The "first-ever row" test is the mechanical guard; write it first and watch it fail.
- **`23505` is overloaded on `profiles`.** Two live unique indexes, same SQLSTATE, opposite remedies. Getting this wrong silently breaks the residue path for the population it exists to protect.
- **Do not "fix" the `case_id` UPDATE omission.** It will look like the obvious unblock. It is the deliberate barrier against re-pointing a row into another case.

## Agent resume notes (for a cold start)

1. Read spec **§2.3** (the `WITH CHECK` template), **§6.1** (all ten verbs + the two correction subsections), **§8.1/§8.2** (scope and edges). The spec is authoritative; this card is a summary.
2. Local Supabase runs under Docker (`npx supabase` is broken on this machine — win32-x64 binary resolution). Read/apply via `docker exec … psql` against `supabase_db_merovisa`. **Do not read production. MV-164's host guard must not be weakened, bypassed, or "fixed."**
3. TDD: write the failing "first-ever `profiles` row through the authenticated client" test **before** touching `lib/profiles/repo.ts`.
4. Regenerate the board with `node docs/kanban/build.mjs`; commit board state before any checkpoint.
5. Open a PR and stop. **The merge is founder-gated.**

## Decision log

- **2026-08-07 — pulled to In Progress after PR #133 merged** (`bbfac1c`), the Stage 3 spec now authoritative on master. Board WIP was clear (0 in progress, 0 ready).
- **2026-08-07 — scope enlarged beyond the original carve, per the MV-166 revision.** The first draft of the spec scoped MV-168 to SQL only. Adversarial verification found grant 1 is `INSERT`-only against an `.upsert()` call site, so it would have been `42501` at its own caller — and the same defect exists on `user_program_state` and `document_status` (spec F-8). **The three conversions are therefore part of this slice, not MV-172's**, because a grant whose only call site cannot use it is a paper resolution.

## Done evidence

**Built 2026-08-08 on `mv-168-consultancy-write-grants`. Gate: `typecheck` 0 · `lint` 0 · `npm test` 333 files / 2677 tests green · `npm run test:integration` 818 tests green (11/12 files; the 12th, `stage2-data-equivalence.itest.ts`, fails to PARSE in this local environment only — reproduced with every change stashed, so it is a toolchain artifact of the borrowed `node_modules`, not this slice. CI runs a clean install and that job is gating).**

**Migration:** `supabase/migrations/20260808120000_stage3_consultancy_write_grants.sql` — three grants, three policies, six apply-time assertions. Applied clean to the local stack. The assertions are the interesting half: (2) refuses `UPDATE (case_id)` **across all nine tables**, not just the three this file touches, because the forbidden patch is the one that would make the `.upsert()` sites work without touching TypeScript; (3) pins the `assessments` UPDATE grant to *exactly* `is_primary`; (5) pins both INSERT grants to their exact column lists so a later table-level `grant` cannot widen them silently.

**The failure mode the card named, caught live.** With the migration applied and the conversions not yet written, `stage3-write-grants.itest.ts` reported **5 passed / 4 failed**: every direct-SQL probe passed — `plan_items` INSERT with `owner IS NULL`, `assessments` UPDATE `is_primary` allowed and `result` refused, both negative conjunct probes — and all four conversion tests still failed. That is precisely "the grants ship inert", demonstrated rather than argued. Writing the conversion test first is what made it visible.

**Three departures from the spec, amended in this PR per spec §1 rule 2:**

1. **INSERT-first, not read-then-insert.** `patchProfileSectionForCase` already does its own UPDATE and only calls `upsertProfileForCase` when that matched **zero rows** — so the function is reached exactly when there is no row to read. Reading first would add a round trip to the one path the grant exists to serve. Same two-branch semantics, `23505` as the resolve. Spec §6.1 amended.
2. **The `23505` trap does not exist** — see the corrected trap 1 above. `profiles_owner_key` was dropped by MV-160.
3. **The derive trigger yields to a supplied `case_id`** since MV-159 — see the corrected verify-note above. Three stale doc comments fixed.

**Two findings the spec could not have had:**

- **MV-160's `42501` decision gate had TWO copies.** The spec located the pin in `stage2-tighten.itest.ts` and said "one test, not eight" — accurate about that file. `student-data-rls.itest.ts` §G held a second copy, an `it.each` over the same four tables. Both discharged here by the same four steps. An enumeration of instances is bounded by where it looked.
- **`caseUpsertColumns` is retired.** With both seam writers on read-then-insert it had no callers, and its own doc comment had handed the refusal forward as "a Stage 3 input" — that input is now consumed. Leaving a helper that refuses every consultancy case is a trap for MV-171/172. Its tests go with it; `tests/architecture/no-actor-equals-student.test.ts`'s export list is down to two.

**The derived completeness guards did real work.** `student-data-rls.itest.ts` reads the granted write surface out of `information_schema` and the `WITH CHECK` arms out of `pg_policy` **at run time**, so the three new grants turned it red until probes were aimed at them — verb-level (`profiles.insert`, `plan_items.insert`, `assessments.update(is_primary)`) and branch-level (`@case` and `@owner` on each). `assessments` also stopped being wholly ungranted, which the guard's `ungranted × 3 verbs` shape could not express, so `REFUSED_BUT_PROBED` now names the two permanently refused verbs explicitly and the comparison stays bidirectional.

**Spec §6.1 contradiction check (criterion 12), stated rather than left silent:** three contradictions found, all three amended in this PR — the residue trap, the read-then-insert wording, and F-8's account of the derive trigger. Stage 2 spec §6 is amended with a decision column and §12 carries a dated entry with six numbered items.

**CI CAUGHT A THIRD FINDING THE LOCAL RUN COULD NOT (PR #134, first `integration` run, red).** `supabase/rehearsal/MV-160-rollback.sql`'s Guard 1 counts the `%_case` policies on the nine and expects MV-159's **24**. MV-168's three are named to the same sibling convention, so the count read 27 and R1 **refused** — correctly: the database was no longer in the state R1 was written against. `stage2-data-equivalence.itest.ts` replays that script inside an always-rolled-back transaction to reach the pre-tighten window, so it went red. That file is the one that fails to PARSE in the local environment, so the local run had reported it as an unrelated toolchain artifact — **which it also was**. Two independent failures wearing one name; the parse error masked a real defect, and only the clean CI install could tell them apart.

Fixed the way the chain is already designed rather than by bumping the number: **`supabase/rehearsal/MV-168-rollback.sql`** now exists (Guard 0 refuses a partially-applied MV-168; policies dropped before grants, both in one transaction, since a policy-less grant is an *unfiltered* verb; four restored-state assertions including an over-revoke check that Stage 2's five UPDATE grants survived). R1 gains a guard that names the three Stage 3 policies and says *"run MV-168-rollback.sql FIRST"* — an instruction instead of a count to decode. The equivalence suite walks the same chain an operator would: Stage 3 unwinds before Stage 2.

Verified by driving the exact SQL the suite drives, through `psql`, since the suite will not run locally: MV-168-rollback → MV-160-rollback reaches `PRE-TIGHTEN-REACHED`, re-applying the tighten migration reaches `RE-APPLY-OK`, all inside one aborted transaction. R1 alone against a Stage 3 database emits the new pointing message. **The proof that this is green belongs to CI, not to me.**

**Not touched:** `cases_insert_admin`, the `cases` column write-surface guard, any schema object, any route signature, any UI. **F-1 and F-3 remain open founder decisions and neither is closed by this slice.**
