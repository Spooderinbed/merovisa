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
