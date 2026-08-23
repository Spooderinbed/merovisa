# MV-191 — Stage 4 exit gate: prove the document boundary holds (Stage 4 slice 6)

## Context links

- **The gate itself:** `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`, "Stage 4 — Document
  collaboration", **Exit gate**.
- **The precedent, and the template:** MV-153 carved and passed the *Stage 1* exit gate the same way —
  `cards/MV-153-cross-tenant-negative-tests.md` and the harness it produced,
  `tests/integration/tenant-isolation.itest.ts`.
- **The five slices under test:** MV-182 (requests), MV-185 (versions + reviews schema), MV-190 (storage paths +
  signed downloads), MV-186 (collaboration UI + the three routes), MV-189 (audit events).
- **`MISTAKES.md`** — read *before* writing a single assertion. Three entries are load-bearing here and are named
  again under Risk notes.

## What the gate actually says

The plan's words, verbatim:

> an unauthorized actor cannot upload, view, download, review, or enumerate a document, and the authorized
> request-to-approval flow works.

Two halves, and they are not the same kind of claim. **Five negative verbs** — upload, view, download, review,
enumerate — each of which must be shown to fail for an actor who should not have it. And **one positive walk**, which
must be shown to succeed end to end for the actor who should.

## Why this is not "we already have tests"

Stage 4 has a lot of green. The reason this card exists is that the green does not add up to the gate, and the ways it
falls short are specific rather than vague:

1. **`tests/integration/stage4-collaboration-walk.itest.ts` proves the HAPPY path only.** Its six cases all walk
   request → upload → reject → re-upload → accept and check the derivation agrees with the trigger. Every one runs as
   an authorized actor. It is the positive half of the gate and is close to sufficient *for that half* — confirm, do
   not rebuild.
2. **`tests/api/case-denial.test.ts` is route-level and mocked.** It sweeps the `app/api` tree and requires each
   case-gated route to answer a denial status with zero queries. That is a real and valuable guard, but it proves the
   route refuses — not that the database would have refused had the route not. Those are different failures and only
   one of them survives a refactor.
3. **MV-153's matrix does not carry the document verbs.** `tenant-isolation.itest.ts` is the right instrument — real
   Supabase, per-role authenticated clients, an explicit cell per (actor, verb, target) — but its verbs are
   `case.read` / `case.update` / `case.invite_student` and the org-scoped set. Document access is not in it.
4. **"Enumerate" appears to be covered by nothing at all.** Verify this before accepting it. The other four verbs are
   about reaching a document; enumerate is about *discovering that one exists* — through a list read, a row count, a
   Storage listing, or an inference from the difference between two error responses. It is the verb most likely to be
   quietly absent, because denial tests are naturally written as "cannot read X" and enumeration is "cannot learn that
   X is there".

**So the first task is an inventory, not a test.** A stage exit gate that re-proves what three suites already prove is
worse than no card, because it costs the same and reports the same confidence while leaving the actual hole open.

## Acceptance criteria

1. **A written coverage inventory**, committed as part of the slice, mapping each of the five negative verbs and the
   positive walk to the specific existing assertion that covers it — file and test name — or to "not covered". Any
   claim of "already covered" must name the test. This is the artefact that makes the gate auditable later.
2. **Every gap the inventory finds is closed**, in the layer where the property actually lives. A property enforced by
   RLS is proven with a per-role authenticated client against real Postgres, not with a mock.
3. **The five negative verbs are each proven for each actor who should not hold them.** At minimum: a counsellor *not
   assigned* to the case, a linked student (who legitimately holds `case.read` and must still be refused upload,
   review, and any staff-only surface), a member of a *different* organization, and an anonymous caller. Positive
   cells belong in the matrix too — a denial-only matrix cannot tell a correct refusal from a broken feature.
4. **Enumerate is proven as its own verb**, not folded into read. Cover at least: the three collaboration list reads
   (`listCaseDocumentRequests` / `listCaseDocumentVersions` / `listCaseDocumentReviews`), a direct row count on each
   collaboration table, and a Storage listing of the `case/` prefix.
5. **Existence is not leaked through the status code.** Assert that an actor who may not reach a case cannot
   distinguish "this document exists but you are refused" from "no such document", on every route that answers both a
   403 and a 404. The routes appear to order their checks so this already holds — MV-186's version route authorizes
   before it looks the request up. Assert it rather than inheriting it, because it is one reordering away from being
   false and nothing else would notice.
6. **The positive walk is confirmed, not rebuilt**, and extended only if the inventory shows the request-to-approval
   flow has a step the existing walk skips.
7. **Every new assertion is mutation-tested.** For each one, name the mutant and the test that died. An assertion that
   kills no mutant is a finding about the test.
8. **A stage-exit summary** in the card's Done evidence stating plainly what is proven, in which layer, and what is
   *not* — following MV-153's "Not tested, and why" and "Residual falsifiability limits" sections, which are the
   reason that card is still readable months later.

## Test plan

- Extend `tests/integration/tenant-isolation.itest.ts`'s matrix rather than starting a new harness, unless the
  inventory shows a reason not to. It already has the actor/target fixtures, the per-role client construction, and the
  cell-per-claim shape. Say so explicitly in the decision log if you diverge.
- The document verbs are end-to-end rather than pure permission strings, so some cells will exercise a route or a
  repository function rather than `checkCasePermission`. That is fine and is the point — the gate is about the
  boundary, not about one function's return value.
- Run integration files **one at a time** on Windows.
- No migration is expected. This slice adds tests and an inventory document; if it turns out a real hole needs a
  schema change to close, **stop and report** rather than folding a migration into a verification slice — that would
  need its own gated production apply.

## Integration gate

`npm run typecheck`, `npm run lint`, `npm test` green, plus the integration suite green against the local Docker
stack. Record the counts and the mutation table on this dossier before moving the card to In review.

## Dependencies / blocked-by

Not blocked. But state the following in the decision log rather than inheriting it silently:

**Stage 3's exit gate was never taken.** MV-174 — "Stage 3 slice 7 — service-role retreat and the stage exit gate" —
is still in Backlog and has **no dossier at all** (`file: null` on the board). So Stage 4's gate rests on a Stage 3
floor that was never formally verified. That is not a reason to block this card, and re-running Stage 3's gate is not
in scope. It *is* a reason to say so in the exit summary, so that "Stage 4 passed its gate" is not read as "Stages 1
through 4 all passed theirs".

## Risk notes

- **A denial-only suite passes identically against a MISSING policy.** This is the single biggest trap on this card
  and it has already bitten this project. If the policy under test were deleted, the negative assertion would still be
  green, because the actor is still refused — by the absence of a grant rather than by the policy. **Mutate every
  policy the gate claims to cover** and read the failing test *names*, not just the count.
- **A crashed vitest worker reports as CLEAN.** `Tests (N) passed` with a suspiciously small duration plus
  `Worker exited unexpectedly` means nothing ran. This is exactly the suite where a false green is most expensive.
- **`*.itest.ts` skip silently without `SUPABASE_TEST_*` set.** A skipped exit gate reports as a passing one. Add an
  explicit guard that fails — not skips — if the gate suite finds no configuration, or state in the summary that the
  gate is only meaningful in CI's `integration` job (which has been gating since 2026-08-03 and is real evidence).
- **A fixture must be able to express what it tests.** Three slices running, a mutant has found a fixture that could
  not: MV-190's all-digit uuid made `.toUpperCase()` a no-op, MV-186's 10-byte PDF never reached the magic-byte
  check, MV-189's org fixture. Here the shape to watch is **`organization_id`**: every case in production is personal
  and carries a null org, so a fixture copied from production shape cannot express cross-organization denial at all.
  Build a real second organization.
- Source-scanning assertions must split on `/\r?\n/`. This is a CRLF tree and `split("\n")` matches zero lines,
  making every assertion vacuously true.

## Agent resume notes (for a cold start)

- Stage 4's build slices are all merged **and** applied to production: MV-182 (`4f59df7`), MV-185 (`b57af21`),
  MV-190 (`8ab5d92`), MV-186 (`15e87c1`, no migration), MV-189 (`20757a1`, no migration). The production ledger ends
  at `20260821150000 stage4_case_storage_paths`.
- The tables are `case_document_requests`, `case_document_versions`, `case_document_reviews`, and `documents`; the
  Storage prefix is `case/<case_id>/<version_id>` in the private `documents` bucket.
- `storage.objects` has **no policy for the `case/` prefix, deliberately** (MV-190 D4) — the bucket's client-facing
  policies key on `foldername[1] = auth.uid()::text` and `case` is never a uid. The only way in is
  `mintCaseScopedDownloadUrl`, which authorizes inside the mint. For that absence, **the mutant is an addition**: to
  test it, plant the declined policy and require a named test to go red.
- **Re-running MV-185's migration ALONE silently un-grants `id`** on `case_document_versions` at exit 0. Restoring the
  mutation harness is two calls: MV-185 then MV-190.
- Local Supabase Docker stack: `SUPABASE_TEST_URL=http://127.0.0.1:54321`, demo JWT secret
  `super-secret-jwt-token-with-at-least-32-characters-long`, issuer `supabase-demo`.
- `vitest.integration.config.ts` excludes `**/.claude/**`, so running the suite from a worktree copy under `.claude/`
  collects **zero** tests and looks like a pass.

## Decision log

- **2026-08-22 — carved.** Number is MV-191; 187 and 188 are reserved for Stage 5 invitations and the per-case visa
  read respectively, and must not be taken by this card.
- **Scope decision at carve time:** this card is the *verification* half of Stage 4's exit gate only. The stage's
  remaining build bullet — scanning, quarantine, backup and recovery controls for pilot documents — is genuinely
  pilot-gated and is deliberately **not** in scope here. The exit summary must say that the gate was assessed against
  the boundary properties and not against those controls, so the stage is not recorded as fully exited on the strength
  of this card alone.
- **2026-08-22 — DIVERGENCE from the test plan, as the card requires it be stated.** The gate lives in a NEW file,
  `tests/integration/stage4-exit-gate.itest.ts`, rather than as new cells inside `tenant-isolation.itest.ts`. It still
  *extends the harness* — same `fixtures/tenancy.ts`, same two real organizations, same per-role authenticated
  clients, same service-role-for-seeding-only discipline — so the reason the card gave for preferring that harness is
  honoured. What is not extended is that suite's *matrix*, because it owns Stage 1's canonical access matrix and pins
  its own shape (`CASE_VERBS`, `TS_ONLY_CELLS`, `DEFERRED_BY_DESIGN.length`); Stage 4 verbs are not Stage 1 verbs, and
  the four Stage 4 suites already established the per-slice-file-over-shared-fixture pattern.
- **2026-08-22 — the fixture already satisfied the `organization_id` risk note.** The card warned that a fixture copied
  from production shape could not express cross-organization denial, because every production case is personal and
  carries a null org, and `NULL = ANY(...)` is NULL. `seedTenancyFixture` already builds two real organizations, so no
  new fixture was needed — but the property is now *asserted* rather than assumed, in "seeded a real SECOND
  organization, so cross-organization denial is expressible at all".
- **2026-08-22 — a deferral that had been silently discharged.** `tenant-isolation.itest.ts` still listed
  "storage: guessed-path download denial → Stage 4" as outstanding, pinned by `DEFERRED_BY_DESIGN.length === 7`.
  MV-190 covered the download half on 2026-08-20 and nobody struck the entry. Struck here, 7 → 6, pointing at MV-190's
  three refusals for the download half and this slice's listing tests for the enumeration half that MV-190 did not
  cover.
- **2026-08-22 — Stage 3's exit gate was never taken, and this card does not take it.** MV-174 is still in Backlog with
  `file: null`. Stage 4's gate rests on a Stage 3 floor that was never formally verified. Re-running Stage 3's gate was
  not in scope and was not done. See the exit summary.

## Integration gate — evidence

Run 2026-08-22 against the local Supabase Docker stack (`SUPABASE_TEST_URL=http://127.0.0.1:54321`, demo JWT secret,
issuer `supabase-demo`), from the worktree root.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no output |
| `npx eslint` | exit 0, no output |
| `npx vitest run` (unit) | **Test Files 386 passed (386) · Tests 3886 passed (3886)**, exit 0 |
| `npx vitest run --config vitest.integration.config.ts` (all itests) | locally on Windows **Tests 995 passed (995)** with **Test Files 1 failed | 19 passed (20)**, one suite failing to parse; **on Linux CI, Test Files 20 passed (20) / Tests 1014 passed (1014)**. Pre-existing, Windows-only, unrelated — see the note below. |
| `stage4-exit-gate.itest.ts` alone | **Tests 50 passed (50)**, 3.56s of test time |
| `tenant-isolation.itest.ts` after the deferral edit | **Tests 429 passed (429)** |
| `stage4-collaboration-walk.itest.ts` (the positive walk, CONFIRMED not rebuilt) | **Tests 6 passed (6)** |

Counts were read at both file and test granularity on every run, and no run reported
`Worker exited unexpectedly` — the failure mode in which a crashed worker prints a clean summary having executed
nothing.

## Mutation table — mutant to the test that died, by name

Harness: `supabase/rehearsal/MV-191-mutation.sql` (SQL mutants) plus two hand-applied TypeScript mutants it documents
but cannot reach. Every SQL mutant restores self-contained, so no migration re-run is needed — which matters here,
because re-running MV-185's migration alone silently un-grants `id` on `case_document_versions`.

**Every mutant below WIDENS.** MV-185's mutants mostly drop, which is right for a suite dominated by positive claims;
an exit gate is dominated by negative ones, and dropping a SELECT policy makes a table deny *more*, so every denial
assertion stays green against it. A denial dies to permissiveness.

| Mutant | Kind | Tests that went red |
|---|---|---|
| `versions_select_org` | widen versions SELECT: admin-of-org to any member | 3 — "counsellorUnassignedA … learns NOTHING from listCaseDocumentVersions"; "… counts ZERO on case_document_versions, while the service role counts more"; "… gets the SAME answer for a real version id and a fabricated one" |
| `requests_select_org` | same, requests | 2 — "counsellorUnassignedA … learns NOTHING from listCaseDocumentRequests"; "… counts ZERO on case_document_requests …" |
| `reviews_select_org` | same, reviews | 2 — "counsellorUnassignedA … learns NOTHING from listCaseDocumentReviews"; "… counts ZERO on case_document_reviews …" |
| `versions_select_true` | blunt calibration: `using (true)` | 9 — all three denied actors × {list read, row count, existence parity} on versions |
| `storage_case_list` | **addition** — plants the `storage.objects` SELECT policy MV-190 D4 declined | 5 — "…lists NOTHING under case/<case A>" for each of the three denied actors; "the ASSIGNED counsellor also lists nothing…"; "listing the BARE case/ root discloses no case id" |
| `anon_read_grant` | **addition** — grants anon SELECT + permissive policy on all three | 1 — "the ANONYMOUS caller learns nothing from any of the three" |
| `anon_write_grant` | **addition** — grants anon INSERT + permissive policy on all three | 4 — "an anonymous client may NOT insert a version" / "… a review" / "… a request"; "nothing the anonymous caller attempted actually landed" |
| `cases_select_org` **+** the TypeScript `deriveCaseGrants` widening, **together** | compound | 2 — "REFUSES counsellorUnassignedA … and the refusal is a DENIAL, not a mint failure"; "the mint answers a refused actor identically whether the object exists or not" |

28 mutant-test pairs across 8 killing mutants, hitting 25 **distinct** tests — `versions_select_org`'s three kills are
a strict subset of `versions_select_true`'s nine, being the same three test templates against the same actor. (An
earlier draft of this line said "26 distinct test-kills", which is neither number: it was a running total that stopped
at the seventh row and dropped the compound one. Every row below carries its own count and the verbatim names of the
tests that went red, so per-mutant decay stays detectable regardless of this headline.) Three further mutants
**survived deliberately** and are retained as findings rather than deleted:

| Survivor | Why it survives — and why that is the interesting part |
|---|---|
| `cases_select_org` alone | The row becomes visible, but `deriveCaseGrants` still refuses an unassigned counsellor. |
| the TypeScript widening alone | TypeScript would allow, but `getCaseContext` reads `cases` through the **actor's** RLS client, so the row is invisible, `caseExists` is false, and it denies before facts are derived. |
| `assign_tenant_counsellors` | Unreachable by construction: `case_assignments_primary_idx` is UNIQUE on `(case_id)` where `assignment_role = 'primary_counsellor'`, and the CHECK admits no other role, so a case has exactly ONE assigned counsellor and no row can be added to widen it. |

**The download verb takes two mutants, and that is the most load-bearing result here.** The mint's denial is defended
independently in RLS *and* in TypeScript; neither layer is load-bearing alone. A future author who removes one will
see a fully green exit gate and reasonably conclude it was redundant. It is not.

### Two mutants that were wrong before they were right

Both are recorded because reading only the pass **count** would have recorded each as evidence that the test was sound.

1. **The first `*_select_org` predicate was inert.** It widened via `case_id in (select c.id from public.cases c where
   c.organization_id = any (private.actor_org_ids()))` and survived at 50/50. A subquery inside a policy is itself
   subject to RLS, and `cases_select_accessor` already hides case A from the very actor the mutant existed to let in —
   so the widening widened nothing. `private.case_org_id()` is SECURITY DEFINER and answers regardless.
2. **The first assignment mutant was a one-shot INSERT, and mutants are applied BEFORE the run.** The suite seeds its
   own organizations, users and cases in `beforeAll` *after* that, so there was no case for the INSERT to widen.
   Schema mutants persist across seeding; data mutants do not and must fire during it. Rewritten as a trigger — at
   which point it hit the unique index above and became the third survivor. Its second draft also used
   `on conflict (id)`, which missed the real constraint `(case_id, user_id)` and raised `23505` inside the fixture's
   own seeding: **49 skipped, 1 passed**, a shape that reads nothing like a surviving mutant.

Also worth pinning: setting the grid cell `counsellor["case.read"]` to `"all-org"` is **not** a widening.
`decideCasePermission` requires the granted scope to equal the grid cell exactly, so raising the cell makes a
counsellor's `assigned` grant stop matching and denies *everyone* — it killed the positive control and left every
denial green. A mutant that makes the suite redder is not automatically a widening.

## Stage-exit summary

### What is proven, and in which layer

- **Upload** — refused for an unassigned counsellor, the linked student, organization B, a forged `organization_id`, a
  forged `uploaded_by`, a cross-case request, and (new) the anonymous caller. **Database**, via RLS + column grants.
- **View** — refused for an unassigned counsellor, organization B and anon; allowed for the assigned counsellor, the
  org admin and the linked student. **Database.**
- **Download** — the `case/` prefix is deny-by-default in Storage for every client including the assigned counsellor;
  the only sanctioned way in, `mintCaseScopedDownloadUrl`, refuses all three unauthorized actors against **real
  Postgres** (previously mock-only), refuses a path belonging to another case as `path-outside-case` rather than as a
  denial, and mints a URL that really fetches the bytes for the assigned counsellor and the linked student.
  **Storage + database + TypeScript**, the last two independently.
- **Review** — refused for the linked student on their own file, an unassigned counsellor, organization B, a
  cross-case version, a forged `reviewed_by`, a forged `organization_id`, and (new) the anonymous caller. **Database.**
- **Enumerate** — proven as its own verb in four sub-modes: the three collaboration list reads, a direct row count on
  each of the three tables, a Storage listing of both `case/<case id>` and the bare `case/` root, and existence parity
  between a real and a fabricated version id. **Database + Storage.** Every denial is paired with a service-role
  existence proof that throws on genuine absence, so none can pass against an empty table.
- **The positive walk** — request → upload → reject → re-upload → accept, with the derivation agreeing with the
  trigger at every step, plus the newest-review rule, the microsecond id tiebreak, the hand-resolved request and the
  status guard. **Confirmed by re-run, not rebuilt.**

### Not tested, and why

- **Scanning, quarantine, backup and recovery for pilot documents.** Stage 4's remaining build bullet. Genuinely
  pilot-gated and deliberately out of scope for this card. **The gate was assessed against the boundary properties and
  not against those controls, so Stage 4 is not recorded as fully exited on the strength of this card alone.**
- **The routes' HTTP status codes themselves.** Existence parity is asserted at the layer that decides it — the
  repository lookup and the mint — not by mounting the Next handlers. `tests/api/case-denial.test.ts` already sweeps
  the `app/api` tree for the denial status with zero queries; that mocked guard and this real-database one prove
  different halves and neither replaces the other.
- **Stage 3's exit gate.** MV-174 was never taken — still Backlog, `file: null`. **"Stage 4 passed its gate" must not
  be read as "Stages 1 through 4 all passed theirs."** Stage 1's gate was taken (MV-153); Stage 3's was not.
- **Production.** This slice has no production step and made none. Every measurement is against the local Docker
  stack. No migration was written; none was needed.

### Residual falsifiability limits

- **The gate is only as good as the fixture's shape.** It uses two real organizations, which production does not have
  — every production case today is personal and carries a null `organization_id`. So the cross-organization cells
  prove the mechanism, not that it is exercised by real tenants. That is the same limit Stage 3's spec §9.3 records,
  and it is discharged in Stage 7's pilot, not here.
- **`anon`'s refusal is a grant refusal, not a policy refusal.** `anon` holds no grant at all on the three tables, so
  PostgREST answers `42501` before any policy is consulted. The anon assertions are therefore evidence about the grant
  surface. `anon_read_grant` / `anon_write_grant` plant both halves precisely because a grant without a policy would
  still deny and would have proven nothing.
- **The three list functions do not authorize; they delegate to RLS.** If a future caller invokes them with a
  service-role client, they will return every row and no test here would notice. What is proven is that they leak
  nothing *when handed an unauthorized actor's client*.
- **Existence parity is proven for the version lookup and the mint, not for every route pair.** It holds today because
  the routes authorize before they look anything up; that ordering is asserted in `tests/api/case-denial.test.ts` at
  the mocked layer and here at the data layer, but a newly added route could reorder its checks and neither would
  catch it until it too is added to one of those sweeps.
- **One new assertion kills no mutant, and by this card's own criterion 7 that is a finding about the test.** "An
  anonymous client may NOT upload bytes under the `case/` prefix" has no mutant behind it: `storage_case_list` and
  MV-190's equivalent both plant `for select` policies only, and `storage_case_list` is scoped `to authenticated`, so
  neither can flip the anon *write*. The property is not unguarded — `20260821150000_stage4_case_storage_paths.sql`
  raises fail-closed when any non-`service_role` `storage.objects` policy's `polqual` **or `polwithcheck`** matches the
  `case/` prefix, and `polwithcheck` is precisely the INSERT half, on every migration replay. But guarded is not the
  same as demonstrated-to-flip. The missing mutant is an `anon_storage_write` addition (an anon INSERT grant plus a
  permissive `for insert` policy on the prefix), which would also want `storage_case_list` extended to `anon`; the
  assertion itself should then check the storage status code and re-list as the service role to show nothing landed.
- **A skipped gate cannot be mistaken for a passed one.** `stage4-exit-gate.itest.ts` opens with a configuration block
  that deliberately does **not** `skipIf`: it fails, loudly, when the three `SUPABASE_TEST_*` variables are absent.
  CI's `integration` job independently fails closed on a skipped suite and has been gating since 2026-08-03.

### A Windows-only parse failure found in passing — `stage2-data-equivalence.itest.ts` (pre-existing, NOT this slice)

Running the whole integration suite locally for this card's gate surfaced a suite that does not run **on Windows**:

```
FAIL  tests/integration/stage2-data-equivalence.itest.ts
SyntaxError: Invalid or unexpected token
```

- **Cause.** Line 79 imports `../../scripts/stage2/capture-read-path-snapshot.mjs`, which opens with
  `#!/usr/bin/env node`. This is the entry already in `MISTAKES.md`: *"Never import a `scripts/*.mjs` with a shebang
  from the test lane — the SSR transform hoists CJS shims above `#!` and the file fails to parse."*
- **Windows only — corrected after first being written up as worse than it is.** The first draft of this note called
  the suite dead and suggested CI's guard might have a gap. **Both were wrong**, and CI settled it: the `integration`
  job on PR #157 reports `Test Files 20 passed (20)` and `Tests 1014 passed (1014)`, with every
  `stage2-data-equivalence.itest.ts` test individually ticked. The suite runs and passes on Linux, contributing the
  19 tests by which CI's 1014 exceeds the local 995. CI's guard is sound and master is not red.
- **What it actually costs.** A Windows developer cannot run that suite and sees a red file with no usable message,
  which is a real local-environment defect and worth fixing — but it is *not* a coverage hole, and nothing in Stage 2
  is unproven because of it.
- **Not caused by this card.** The itest and the `.mjs` are byte-identical to `origin/master`. Ruled out and not worth
  redoing: 36,395 bytes with **zero** control bytes, and `tsc` parses the file without a syntax error — the failure is
  at import time.
- **Scope call.** Deliberately **not fixed here**: it is MV-160's file and belongs in its own card rather than folded
  into a Stage 4 verification slice. It touches no Stage 4 claim — every Stage 4 suite, and this card's own gate, ran
  and passed on both platforms.

### CI

All four checks green on PR #157: `integration` **pass (4m33s)**, `validate` **pass (4m8s)**, Vercel + Vercel Preview
Comments pass. The `integration` job self-hosts its own Supabase stack and has been gating since 2026-08-03, so this
is real evidence rather than a skipped lane — and it is the run that corrected the note above.
