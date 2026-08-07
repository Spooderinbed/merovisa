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

1. **`upsertProfileForCase` already treats `23505` as the residue signal** (`repo.ts:89-92` → `adoptOwnerKeyedResidue`), and the legacy `profiles_owner_key` unique on `owner` is still live. Both collisions raise the same SQLSTATE. The conversion must **distinguish the `profiles_case_idx` collision (resolve: re-read and update) from the `profiles_owner_key` one (adopt residue, then retry)** — treating any `23505` as a resolve silently breaks the residue path.
2. **The two seam writers call `caseUpsertColumns`** (`lib/cases/dual-write.ts:153-160`), which returns `null` for any case with no `student_user_id` — so they **refuse a consultancy case outright today**. Its doc-comment records this as *"a Stage 3 input"* (`:147-151`). The conversion must move them onto an ownership helper that permits `owner: null` (`caseWriteColumns` already returns it legitimately — `:116`) and supply `case_id` explicitly, which is legal on INSERT because `case_id` is in every INSERT grant.

**Verify during build, do not assume:** `mv155_derive_case_id_from_owner` runs on `document_status` and `user_program_state` and derives `case_id` only when `case_id IS NULL AND owner IS NOT NULL`. Supplying `case_id` should skip that branch — confirm it does, and confirm the personal-case path is unchanged.

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

- [ ] **The three grants and three policies exist**, each INSERT policy carrying the full three-conjunct `WITH CHECK` of spec §2.3 — verified by reading `pg_policy` back, not by reading the migration file.
- [ ] **A counsellor assigned to a student-less case INSERTs a `profiles` row and a `plan_items` row through the AUTHENTICATED client, with `owner IS NULL`**, and the row is read back.
- [ ] **The same INSERT naming another user's id as `owner` is refused** (`42501` / RLS violation). This is the third conjunct doing its job; without a negative test the conjunct is unproven.
- [ ] **`assessments` INSERT and `documents` INSERT still raise `42501`** through the authenticated client — the two DEFERRED HALF assertions that stay.
- [ ] **`assessments` UPDATE succeeds for `is_primary` and is refused for `result`** through the authenticated client. The refusal is the point of narrowing.
- [ ] **The authenticated client creates a FIRST-EVER `profiles` row for a case it may reach** — a test that **fails against the `.upsert()` form** and passes after the conversion. Without this, grant 1 ships inert.
- [ ] **`setObtained` and `upsertProgramState` succeed on a case with `student_user_id IS NULL`.** Today `caseUpsertColumns` refuses both. Assert **the row exists**, read back — never that the call "did not throw": both return `false` rather than raising.
- [ ] **No personal-case regression.** The existing service-role callers of all three converted helpers still work: profile save, plan generation, checklist tick, shortlist write. `npm test` + `npm run test:integration` green.
- [ ] **The residue path still works** — a `23505` on `profiles_owner_key` still adopts and retries; a `23505` on `profiles_case_idx` resolves without adopting.
- [ ] **MV-160's pin retired per the four steps**, with the header comment rewritten and lines 775/783 untouched.
- [ ] **Stage 2 spec §6 amended + dated §12 entry**, recording the three departures (assessments INSERT refused; assessments UPDATE narrowed; documents INSERT deferred to Stage 4).
- [ ] **Spec §6.1 amended in THIS PR if anything above contradicted it** (spec §1 rule 2). If nothing did, say so explicitly on this card — silence is not a discharge.

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

(pending)
