# MV-172 — Stage 3 slice 5: render the existing experience inside an explicit case route

**Priority:** P1   **Owner:** agent
**Goal:** Let a counsellor open a student's case and work *in it* — profile, matches, plan, checklist — with every write landing on **that case** and travelling through the **authenticated** client. This is the first time a non-student actor reaches student data through the product rather than around it.

**Authoritative spec:** `docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md` (§4 cells 13–17 and 21–23, §5, §6.1, §6.2 entries 8–9, §6.3, **F-8**, §9.1 E4/E7). **Where this card disagrees with the spec, the spec wins. If the implementation contradicts the spec, amend the spec IN THIS PR** (spec §1 rule 2).

## Predecessors — both cleared, verified not assumed

| Dependency | State |
|---|---|
| **MV-168** write grants | Merged **and applied to production 2026-08-11** (`20260808120000`, ledger stamped, no drift). `profiles` INSERT, `plan_items` INSERT, `assessments` UPDATE `(is_primary)` are live. |
| **MV-168** UPSERT conversions | Done. **`caseUpsertColumns` is gone** — `lib/cases/dual-write.ts:129-131` records its removal by name. F-8 failure mode 2 (the seam that refused every student-less case) no longer exists. |
| **MV-171** case creation | Merged. A student-less case can be created and assigned, so this slice has something real to open. `app/(app)/workspace/[organizationId]/students/[caseId]/manage/page.tsx` is the surface this route sits beside. |

## The finding this card adds: **seven** routes take no case id, not five

Spec F-8 names five. That count is correct *for what F-8 was measuring* — routes invisible to §6.2's service-role lens, because they already run on the authenticated client. It is **not** the count of routes that need a case id. Two more resolve the actor's own case and are simply visible to the registry, so F-8 did not list them:

| # | Route | Verb | Writes | Named by |
|---|---|---|---|---|
| 1 | `app/api/shortlist/route.ts:46` | POST | `user_program_state` | F-8 |
| 2 | `app/api/documents/status/route.ts:33` | POST | `document_status` | F-8 |
| 3 | `app/api/outcomes/prediction/route.ts:28` | POST | `program_predictions` | F-8 |
| 4 | `app/api/outcomes/attempt/route.ts:31` | POST | `application_attempts` | F-8 |
| 5 | `app/api/outcomes/event/route.ts:32` | POST | `outcome_events` | F-8 |
| 6 | `app/api/plan/action/route.ts:37` | POST | `plan_items` | §6.2 entry 8 (as a *client* flip) |
| 7 | `app/api/profile/section/route.ts:37` | PATCH | `profiles` + `plan_items` | §6.2 entry 9 (as a *client* split) |

All seven call `resolvePersonalCaseId(<user>.id, supabase)` — verified at those exact lines. **A case route that parameterizes only F-8's five ships with the plan and the profile editor still writing to the counsellor's own case.** §6.2 gives 6 and 7 a client disposition and says nothing about their case id; that is a gap in the carve, not a decision, and this card closes it. **Amend spec F-8 in this PR** to state seven.

**Also flagged, deliberately NOT in scope:** `app/api/outcomes/route.ts:17` is a **GET** that resolves the actor's own case. It is a read, so cell 13's `*_select_case` policies keep it safe from leaking — but in the case route it would render the *counsellor's* outcomes under the student's name. That is a correctness-and-trust bug of MV-173's kind (whose case am I looking at), not a write-safety one. **Record it; do not fix it here.** Same for `app/api/guide/chat/route.ts:52` — the guide is not in this slice's rendered surface.

## Context links

- Spec **§4 cell 13** — read the case's data: `*_select_case` → `actor_case_ids()` on all nine tables. Already live; this slice consumes it.
- Spec **§4 cell 14** — edit profile, `profiles_update_case` + column grant `(sections, completeness)`. **The field allowlist is enforced by Postgres, not TypeScript** — that TS gap is MV-173's, not this card's.
- Spec **§4 cells 15/16** — profile row creation and plan items: MV-168's grants, now live in production.
- Spec **§4 cell 17** — documents: **Stage 4.** Read and delete only; upload stays service-role.
- Spec **§4 cells 21–23** — the three F-8 surfaces this slice carries.
- Spec **§6.2 entries 8–9** — entry 8 retires; **entry 9 narrows and must keep its registry entry.**
- `lib/cases/context.ts:100` — `getCaseContext`, the resolver this route authorizes against.
- `lib/cases/require-permission.ts` — the case-scoped gate MV-171 established; match it, do not reinvent.
- `lib/cases/dual-write.ts` — `caseWriteColumns` is the surviving writer helper.
- MV-170 `lib/cases/list-repo.ts` and MV-171 `lib/cases/write-repo.ts` — the repo patterns this slice follows.

## Scope

### In
- **The case route itself** — the existing experience (profile, matches, plan, checklist) rendered under `app/(app)/workspace/[organizationId]/students/[caseId]/…`, authorized through `getCaseContext` + case-scoped permission, reading as the **authenticated** user.
- **All seven routes above** take an explicit, authorized case id instead of resolving the actor's own. Authorize the id — never trust it from the request.
- **`app/api/plan/action/route.ts` moves off service-role entirely** and its registry entry (`lib/supabase/service-role-exceptions.ts:224`) is **deleted**. Grant 5 is what it was waiting for and grant 5 is live.
- **`app/api/profile/section/route.ts` SPLITS.** See the trap below. Its registry entry (`:233`) **stays**, with a rewritten justification.

### Out
- **Documents model, Storage paths, signed downloads** — Stage 4. Object paths stay owner-keyed through Stage 3 (Stage 2 spec §8).
- **Case-context indicators** — MV-173. This slice may not add "you are viewing X's case" chrome; MV-173 owns it and will do it once, everywhere.
- **The TypeScript field allowlist** — MV-173.
- **Any SQL.** MV-168 was the stage's only migration. **A reviewer who finds a migration in this diff should reject it.**
- `outcomes` GET and `guide/chat` — recorded above, not fixed here.

## The trap: `profile/section` fails SILENTLY if flipped whole

Three legs on that route's admin client are refused by spec §6.1 and **must stay service-role**:

| Leg | Write | Why it cannot move |
|---|---|---|
| `invalidatePlan` copy refresh | `plan_items` UPDATE `(impact, title, body, lift_estimate, time_estimate)` | generator-owned columns, refused |
| `adoptOwnerKeyedResidue` | `UPDATE (case_id)` | `case_id` is omitted from every UPDATE grant **by design** |
| `reScoreAssessment` (`:58`) | `assessments` UPDATE `(result)` | re-scoring stays server-side, refused permanently |

**Why this is a blocker and not a detail:** `lib/assessments/re-score.ts:33` never destructures `error`, and a PostgREST `42501` **resolves rather than rejects**. `throwOnError` appears nowhere in `lib/` or `app/` — re-verified on this branch; the only two hits are comments in `lib/cases/write-repo.ts:32` and `lib/org/repo.ts:27` *describing its absence*. Flip the route wholesale and **every profile edit silently stops updating the student's verdict, with a green suite.**

`tests/supabase/service-role-exceptions.test.ts:280` requires every module constructing the admin client to be registered and `:293` requires every registered entry to still construct one — so a builder **cannot** keep the admin client and delete entry 9. Attempting it is red at best, a silent trust regression at worst.

## Acceptance criteria

1. An assigned counsellor opens a **student-less** case and sees that case's profile, matches, plan and checklist — as the authenticated user, no service-role read.
2. Every write control in the case route writes a row whose `case_id` **is the case in the URL**, proven by reading the row back — never by a 200.
3. A counsellor **not** assigned to the case, and an inactive member, are refused at the route.
4. `app/api/plan/action/route.ts` constructs no admin client and holds no registry entry.
5. `app/api/profile/section/route.ts` writes `profiles` on the authenticated client, keeps the three refused legs on an explicitly-scoped admin call, and **keeps its registry entry** with an honest justification.
6. Spec F-8 amended to seven routes; `outcomes` GET recorded as MV-173's.

## Test plan — with the vacuity guards, which are the point

Spec §9.2 exists because these tests pass for free if written the obvious way.

- **Never assert "did not throw", never trust a boolean return.** `setObtained` and `upsertProgramState` return `false` on refusal. Assert **the row exists**, read back by `(case_id, kind)` / `(case_id, program_id)`.
- **E7's fixture requirement, non-negotiable:** the counsellor under test **must hold a personal case of their own, carrying at least one pre-existing row on the same table.** Without it a mis-scoped write has nowhere to land, and a route that ignores the case id is indistinguishable from one that honours it. This is the single easiest way to ship this slice green and broken.
- **Assert the actor's JWT role is `authenticated`.** A test run as `service_role` bypasses every policy and proves nothing (E1).
- **The case under test must have `student_user_id IS NULL`**, and rows written must carry `owner IS NULL` (§6.3), with a **created-row count > 0**.
- **A negative per route:** counsellor requests case B while assigned only to case A → refused, and **case A gains no row** (the wrong-case write is what we are hunting).
- **Silent-failure regression test for `profile/section`:** a profile edit must still move the assessment result. Assert the verdict changed, not that the request returned 200.
- Integration lane: `npm run test:integration` against the local Docker stack. Note `stage2-data-equivalence.itest.ts` fails there for an unrelated `.mjs` shebang parse trap — a known, pre-existing red, not this slice's.

## Risk notes

- **Windows working tree is CRLF.** Split on `/\r?\n/`, never on a bare newline literal — a `"\n"` split matches zero lines here and assertions go vacuously green on Windows while passing on Linux CI.
- **The flaky arch test.** `no-actor-equals-student > M4b` times out at 5s under full-suite load on this machine (≈588ms in isolation). Baseline a clean `origin/master` run before blaming this change.
- **This slice cannot be proven in production.** With the Stage 0 D-B legal gate shut there is no consultancy org and no student-less case in prod. Green here licenses *"the mechanism is built and proven under RLS as the authenticated user"* and **never** *"it works for real students"* (spec §9.3). Say so in the PR.

## Evidence — built 2026-08-11, branch `mv-172-case-route`

**Gate:** `npm run typecheck` clean · `npm run lint` clean · `npm test` **357 files / 3186 tests, 0 failed**.

**The integration lane was NOT run in this session, and that is a gap, not a pass.**
`tests/integration/stage3-case-route.itest.ts` is written, typechecks and lints, but was never
executed here: Docker Desktop's Linux engine on this machine holds **zero images and zero volumes**,
so the local Supabase stack does not exist, and `npx supabase` is broken on win32-x64 here (prior
measurement) so it could not be created. The suite is therefore **unexecuted code** until CI runs
it — and CI does: the `integration` job self-hosts its own Supabase stack and has been **gating**
since 2026-08-03. **Read that job's result on the PR before treating any claim below about row
shape, `owner IS NULL`, or cross-case refusal as evidence.** Everything asserted from `npm test` is
evidence today; everything asserted from the `.itest.ts` is a claim awaiting CI.

### What shipped

| Piece | Where |
|---|---|
| The case route — 7 pages | `app/(app)/workspace/[organizationId]/students/[caseId]/` → `page`, `profile`, `matches`, `plan`, `checklist`, `checklist/all`, `checklist/[programId]` |
| The gate | `lib/cases/case-route.ts` — uuid check → auth → `case.read` → `readOrgCase` + org match, **in that order** |
| Shared surfaces | `components/case-experience/{profile,matches,plan,checklist-landing}-panel.tsx`. The four personal pages now render the SAME panels: one implementation, two case ids |
| The seven routes | one helper — `lib/cases/target-case.ts` (`resolveTargetCase` / `requestedCaseId` / `targetCaseResponse`) |
| The browser half | `components/cases/case-scope.tsx` — `CaseScopeProvider` + `useCaseScopeId` + `caseScoped()`, read by all five write controls |
| §6.2 entry 8 **retired** | `app/api/plan/action/route.ts` constructs no admin client; registry entry deleted (17 → 16 entries; 8 `legacy-owner-scoped`) |
| §6.2 entry 9 **narrowed** | `app/api/profile/section/route.ts` splits; entry KEPT, justification rewritten to name all three refused legs |
| Spec amended | F-8 → **seven**, §4 footnote ², §9.1 E7, §8.1 MV-173 row, §11 decision log |

### The findings this slice added

1. **F-8 counts seven, not five.** `plan/action:37` and `profile/section:37` call
   `resolvePersonalCaseId` on the identical line of the identical block. F-8 missed them because
   they were *visible* to §6.2's registry lens, which asked a different question of them. Fixing
   only five ships the case route with the plan and the profile editor writing to the counsellor's
   own case.
2. **`tests/api/case-denial.test.ts:547` asserted the OPPOSITE invariant** — *"a denial never reaches
   the permission check with a case the CLIENT supplied"* — and would have gone red. It was correct
   for MV-157 and is exactly what F-8 asks this slice to change. **Amended, not deleted:** the
   property was never "ignore what the client sent", it is **authorized, never trusted** (plan line
   354). Three tests replace the one.
3. **The browser half is covered by no route test.** A control that never names its case sends no
   `caseId`, the route falls back exactly as before, and every route test still passes. Hence
   `tests/components/case-scoped-writes.test.tsx`, which renders each of the five controls **inside
   and outside** a scope.
4. **The spec's registry count was already one behind** (§11 said 16; the working tree said 17).

### Vacuity guards actually carried

- **Never a boolean, never "did not throw".** Every positive reads the row back service-role by
  `(case_id, kind)` / `(case_id, program_id)` and asserts a created-row count **> 0**.
- **E7's fixture requirement.** `tests/integration/stage3-case-route.itest.ts` gives
  `counsellorAssignedA` a personal case carrying a pre-existing `document_status` **and**
  `user_program_state` row on the same tables and keys the tests write — so a mis-scoped write has
  somewhere to land, and every positive *also* asserts the counsellor's own row is untouched. The
  shortlist test deliberately targets a **different** program from the counsellor's own row, so a
  wrong-case write would resolve onto that row rather than erroring.
- **`jwtRoleClaim(...) === "authenticated"`** asserted in `beforeAll`.
- **`student_user_id IS NULL` asserted on the case under test**; `owner IS NULL` on every row written.
- **A negative per route, all seven** — counsellor requests org B's case while assigned only to org
  A's: refused, and row counts across seven tables unchanged on **both** the requested case and the
  counsellor's own.
- **The silent-failure regression:** a profile edit must still move the assessment `result`, seeded
  with a marker no re-score would ever produce, so "the verdict changed" cannot pass by accident.
- **Completeness derived from the tree, not a list:** `tests/api/case-scoped-routes.test.ts` sweeps
  `app/api` for `resolveTargetCase` (must equal the seven) **and** for `resolvePersonalCaseId` (must
  be empty outside a named out-of-scope set) — the half that would catch an eighth route.

### Not proven here — stated, not papered over

- **Production.** 0 orgs, 0 memberships, 0 org cases (verified 2026-08-11). Spec §9.3 applies in
  full: green licenses *"the mechanism is built and proven under RLS as the authenticated user"* and
  **never** *"it works for real students"*.
- **The three `outcomes` routes' positive DB path.** Covered in the integration suite by their
  **refusal only**. The happy path needs a frozen prediction, which needs the catalogue readable
  through PostgREST — it is not, on this stack (`stage3-write-grants.itest.ts` reads `programs`
  through `psql` for the same reason). Their case-id plumbing is proven in the unit matrix and their
  grants in `stage3-write-grants.itest.ts`; the end-to-end write on a student-less case is proven
  nowhere.
- **`app/api/outcomes/route.ts:17`** — same own-case shape but a GET, so it misattributes rather than
  leaks. Recorded in the spec **and** in the test's out-of-scope set. MV-173's.
- **No SQL.** MV-168 was the stage's only migration; this diff contains no migration.

## Resume notes for a cold agent

- Branch off a **freshly fetched** `origin/master` — a stale local ref recently made the board look like it had lost a card.
- Build in a worktree with populated `node_modules`; the primary worktree has none, and `npm ci` must never run into OneDrive.
- Regenerate board views with `node docs/kanban/build.mjs`. `board.md` / `board.html` are generated — never hand-edited. `board.json` edits are in-place or **append-only**, never a dedup-union.
- Merges to `master` are **founder-gated**; `master` is production.
