# MV-190 — Case-scoped Storage and signed downloads (Stage 4 slice 3)

**Priority:** P1 · **Owner:** agent · **Created:** 2026-08-20

## Why

MV-185 gives a version a row. This gives it a **file**, and gives a counsellor a way to read
one without handing them the student's whole Storage folder.

`app/api/documents/upload/route.ts:65-69` pinned the deferral in writing:

> the object path below stays OWNER-keyed. Case-aware Storage paths are Stage 4 (spec §8): a
> `<case_id>/…` object matches the live `(storage.foldername(name))[1] = auth.uid()::text`
> policy for NOBODY, so moving it here would force the Stage 4 policy rewrite into Stage 2
> without its authorization model.

This is the slice where that authorization model arrives.

**Spec:** `docs/superpowers/specs/2026-08-20-case-document-collaboration.md` §1.1, §4, §5.
**Plan:** `…2026-08-19-consultancy-workspace-ui-build.md` §3, PR 5B — the second half of the
split. Sequenced **after MV-185 and before MV-186**; the number is higher only because the plan
had already reserved MV-186–189.

## Scope

1. **A new case-keyed prefix** `case/<case_id>/<version_id>` for collaboration objects, with
   its own `storage.objects` policy riding the case axis. A new prefix, so **nothing existing
   moves**.
2. **A short-TTL signed-download helper.** Counsellor access to a file — vault or
   collaboration — is a signed URL minted server-side *after* our own case authorization.
3. **The three document routes accept a NAMED case id and authorize it.**

## The correction this card exists to carry

The plan says 5B must do "case-scoping the three existing routes". **They are already
case-scoped** — MV-157 §G did it, and each route authorizes the case before any Storage call
and filters the row by `case_id` (`[id]/route.ts:25`, `[id]/view/route.ts:35`,
`upload/route.ts:74`).

The real gap is narrower: all three resolve **the actor's own** case via
`resolvePersonalCaseId(userId, supabase)` (`upload/route.ts:70`). A counsellor cannot name a
student's case, so they cannot act on one. This card closes that for these three routes — the
same shape as the standing **F-8** finding across five case-scoped write routes. F-8's other
two routes stay open and are not this card's job.

## The fence

- **Existing owner-keyed vault objects are NOT migrated.** They are live student PII in
  production; copy-and-rewrite of `documents.file_path` is a data-loss-shaped operation with no
  reason to run. Counsellors reach them through the signed-URL path instead.
- Nothing in `documents` or `document_status` — same fence as MV-185.
- No UI. MV-186 is the UI.

## Acceptance criteria

1. A collaboration object lands at `case/<case_id>/<version_id>` and is readable by a
   counsellor who can staff that case, and by nobody else.
2. **Authorization happens before the URL is minted.** A signed URL bypasses Storage RLS by
   design — that is exactly why the check must be in our code, and tested there, on the mint
   call rather than on the fetch.
3. TTL is short and asserted as a number, not "short" in prose.
4. The three routes accept a case id, authorize it with `checkCasePermission`, and refuse a
   case the actor cannot reach — with the same denial shape the routes already use.
5. A counsellor cannot read a vault object by guessing an owner-keyed path: the live
   `(storage.foldername(name))[1] = auth.uid()::text` policy still denies direct access, and
   the new policy grants only the `case/` prefix.
6. Existing student upload / view / delete behaviour is unchanged — pinned by the existing
   suite, which must stay green without edits to its assertions.

## Test plan

- Unauthorized upload / view / **download** / review denial per plan §7.
- RLS **mutation** tests on the new `storage.objects` policy — drop it and watch a named test
  go red. A denial-only probe passes against a missing policy.
- Policy→verb binding asserted with `polcmd::text`.
- The mint-time refusal from criterion 2 (assert the helper throws/refuses, not that a fetch
  404s).
- The path-guessing denial from criterion 5, with a control so a false "denied" is detectable.
- `*.itest.ts` skip silently without the three `SUPABASE_TEST_*` vars — check the count ran.

## Data

New migration touching `storage.objects`. **Own rehearsal, own gated production apply**, separate
from MV-185's. Same ledger discipline: `execute_sql`, never `apply_migration`; hand-stamp;
verify against the prod ledger after merge, because master auto-deploys and migrations do not.

## Resume notes for a cold agent

- Read spec §1.1 before touching the routes — the plan's description of the work is wrong and
  will send you to add case scoping that is already there.
- `storage.objects` policies are the one place in this repo where a wrong policy is silently
  permissive rather than loudly broken. Mutation-test it.
- Signed URLs are unauthenticated once minted. Everything security-relevant happens before.

---

## Built — 2026-08-21 (branch `mv-190-case-storage-and-downloads`)

Spec pass first, as MV-185 did: **spec §6** records the two premises, measured against the live
production catalogue and re-measured identically on the local stack.

### The two decisions the card asked for

**(A) NO new `storage.objects` policy — §4 (3) superseded by §6.1 (D4).** The bucket already denies
the new prefix to every client: `(storage.foldername(name))[1]` is the literal `case`, which equals
no `auth.uid()`, and every write already runs as `service_role`. A SELECT policy admitting
`authenticated` to `case/` would be a second path to the same bytes and the weaker one — it would
restate "may this actor staff this case" in SQL and drift from `checkCasePermission` unobserved.
Defended three ways rather than asserted: a denial test **with a control**, an **additive** mutant
that plants the declined policy, and an apply-time guard that no `storage.objects` policy admits a
non-`service_role` without keying on `auth.uid()` and that none names the case prefix.

**(B) `id` joins the versions INSERT grant, and `storage_path` gets a bound.** The deciding argument
is write ORDERING, not preference: without `id` the sequence must be INSERT → UPLOAD, so a failed
upload strands a version row pointing at bytes that do not exist — with no DELETE grant to retract
it, holding the request `outstanding` behind a file nobody can open. With `id` it inverts to
UPLOAD → INSERT, where a failed upload writes no row. A `before insert` trigger computing the path
from a server-issued id was weighed and rejected for exactly that reason. Granting `id` completes
client control of `storage_path`, so MV-190 adds the CHECK MV-185 deferred to it — a table
constraint, not a policy conjunct, so it binds `service_role` too.

### Corrections to the card's own premises, both measured

1. **MV-185 §8 (4) does NOT fail MV-190 at apply time.** It runs at MV-185's timestamp, before the
   new grant exists. MV-190 applied cleanly twice with MV-185 left byte-identical to what production
   ran.
2. **The real hazard was not predicted, and is worse.** MV-185's §6 opens `revoke all … from anon,
   authenticated` and re-grants its own nine columns, so **re-running MV-185 alone silently reverts
   MV-190's grant** — and its §8 (4) then passes, because it has just restored the state it pins. No
   assertion in either file can catch that. Fixed by a two-file restore in both harness headers, and
   made loud by `stage4-case-storage.itest.ts` naming the grant in its very first test.

### Gate

| gate | result |
|---|---|
| `npx tsc --noEmit` | **0 real errors** (only the known stale `.next/**` TS2307 noise) |
| `npm run lint` | **clean**, exit 0 |
| `npm test` | **3650 passed / 379 files**, exit 0 |
| `npm run test:integration` | **920 passed, 0 test failures.** One file fails to COLLECT: `stage2-data-equivalence.itest.ts`, the pre-existing `.mjs`-shebang parse trap. Not in this branch's diff, and it imports `scripts/stage2/capture-read-path-snapshot.mjs`, which this branch does not touch. |

### RLS / constraint mutation evidence — `supabase/rehearsal/MV-190-mutation.sql`

Six mutants, each run mutate → suite → restore → re-assert. **20 tests collected on every run and
zero `Worker exited unexpectedly`**, checked per run because a crashed worker reports as clean.

| mutant | red | the NAMED tests it killed |
|---|---|---|
| `id_grant` | 2 | "grants `id` on the versions INSERT, so the client can name the object before it writes the row" · "ADMITS a version whose path sits under its own case, written with a client-chosen id" |
| `path_check` | 4 | "bounds storage_path to the row's own case with a VALIDATED check constraint" · "REFUSES a version on this case whose storage_path names ANOTHER case" · "REFUSES a version whose storage_path is an owner-keyed vault path rather than case-keyed" · "binds `service_role` too, which is the half a policy conjunct could not reach" |
| `path_check_loose` | 3 | the two cross-case ones + the constraint-shape one. **The owner-keyed refusal stays GREEN**, which isolates "wrong case" from "not case-keyed at all" |
| `path_check_not_valid` | 1 | "bounds storage_path … with a VALIDATED check constraint" — only. Insert-time refusals stay green: `NOT VALID` still checks NEW rows; what it stops checking is rows that already exist |
| `storage_case_read` (ADDITIVE) | 5 | "REFUSES a direct download of a case/ object to the counsellor who may staff that case" · "…to an outsider as well" · "carries exactly the three known policies, each bound to the verb it claims" · "admits no non-service_role policy that fails to key on auth.uid()" · "carries no policy that names the case prefix, in either spelling" |
| `storage_own_read` | 2 | "CONTROL — the same actor, same client, same run CAN download their own uid-keyed object" · the policy-census test. **The two `case/` refusals stay GREEN** — which is what proves they are about the prefix and not about Storage auth being broken for everyone |

Two things the mutants caught in the evidence itself:

- `id_grant` first killed **4**, because the two constraint refusals supplied an `id` and so failed
  with `42501` before reaching the constraint. The payload helper now makes `id` optional and those
  refusals exercise only MV-185's nine columns. A mutant that kills a superset cannot tell you which
  sentence is load-bearing.
- `storage_case_read` first killed only **4**: the planted policy spells the prefix
  `(storage.foldername(name))[1] = 'case'` — the folder name, **no slash** — so a `%case/%` pattern
  sailed straight past it. The migration guard and the test now match the quoted-token spelling too.
  That is the card's own warning ("silently permissive rather than loudly broken") landing on the
  guard written against it.

### Apply-time guards, each falsified

Each violation planted inside `begin; …` with no commit, so the stack is untouched either way. **All
11 refused, each with its own message:** `grant-extra-column`, `reviews-grant-widened`,
`update-grant`, `delete-grant`, `constraint-not-valid`, `constraint-loose`, `storage-policy-no-uid`,
`storage-policy-uid-plus-case`, `index-partial`, `documents-grant`, `census`.
`storage-policy-uid-plus-case` is the one that earns the second sentence of the D4 guard: it keys on
`auth.uid()` **and** admits `case/`, so guard 1 cannot see it.

### Code guards, each falsified by reverting the fix

| guard reverted | tests red |
|---|---|
| the path bound in `mintCaseScopedDownloadUrl` | "REFUSES a case-keyed path belonging to ANOTHER case, even though the case check passed" — exactly one |
| the separator boundary in `isOwnCaseObjectPath` | "REFUSES a key whose case segment merely STARTS WITH this case id" · "REFUSES a case-keyed key with nothing after the case segment" |
| the case decision deferred until after the mint | "waits for the case DECISION before it reaches Storage" · "REFUSES a denied case and never calls Storage" · "reports a lookup failure as a denial with its reason" |
| upload ignores the named case id | "authorizes the REQUESTED case and never consults the actor's own" · "puts a NAMED case's object under the case/ prefix" · "400s on a malformed case id rather than falling back" |
| upload keeps the owner-keyed path for a named case | "puts a NAMED case's object under the case/ prefix, not in the actor's uid folder" — exactly one |

**A test was found weaker than its name, and fixed.** "authorizes BEFORE it reaches Storage" stayed
GREEN under the deferred-await mutant, because the mock recorded when the permission call was
INVOKED rather than when it ANSWERED — so a plausible "parallelise these two" refactor slipped past
it. The mock now resolves a microtask later and the test is renamed "waits for the case DECISION
before it reaches Storage". It goes red under that mutant.

### Acceptance criteria

1. **Met.** A `case/<case_id>/…` object reaches a counsellor who can staff the case through the
   minted URL, and nobody else: direct reads are refused for the staffing counsellor, an outsider
   and anon, against a service-role existence proof and a positive control.
2. **Met, by construction.** `mintCaseScopedDownloadUrl` performs `checkCasePermission` itself —
   no already-authorized flag to pass, no ordering to get wrong. Asserted on the MINT CALL
   (`createSignedUrl` never reached) at both the helper and the route.
3. **Met.** `SIGNED_DOWNLOAD_TTL_SECONDS === 60`, asserted as a number, plus a test that the
   exported constant is the value that actually reaches Storage.
4. **Met.** All three routes take a named case through `resolveTargetCase`, refuse one they cannot
   reach (403 with the shape the routes already used), and 400 on a malformed id with no fallback.
5. **Met, with a control and an additive mutant.** See `storage_case_read` / `storage_own_read`.
6. **Met.** `tests/api/documents/upload.test.ts` and `delete.test.ts` are untouched and green. The
   no-case-named branch is byte-identical, owner-keyed path included.

### One thing built that the card did not name

The upload route's object path **forks**: no case named → today's owner-keyed
`<uid>/<kind>/<uuid>.<ext>`; a NAMED case → `case/<case_id>/<uuid>.<ext>`. Without the fork, a
counsellor uploading to a student's case would write into the COUNSELLOR's uid folder, where the
live `(storage.foldername(name))[1] = auth.uid()::text` policy lets them read it directly and
forever, outliving the assignment. This slice is what makes a counsellor upload possible at all, so
it closes the hole it would otherwise open. The fork turns on "was a case named" and nothing else,
which is what makes the unchanged branch provably unchanged.

### What this slice deliberately did NOT do

- **No `storage.objects` policy** (§6.1), and **no migration of existing owner-keyed vault objects.**
- **Nothing in `documents` / `document_status`.** `documents_case_kind_idx` survives, asserted at
  apply time; the vault's grant surface is pinned SELECT-only.
- **No UI** (MV-186), and **no route that writes a version row.** MV-190 makes the path writable and
  readable; it does not add the writer.
- **F-8's other two routes** (`outcomes` GET, `guide/chat`) stay open, as the card scopes it.
- **The at-mint audit event** is still owed; the registry entry for `[id]/view` says so.

### Not applied to production

The migration is local-only. Applying it is a separate founder-gated step: `execute_sql`, never
`apply_migration`, then hand-stamp the ledger and re-verify — master auto-deploys, migrations do not.

### Assertions changed outside this slice's own files

- `tests/integration/stage4-document-collaboration.itest.ts` — "grants exactly SELECT and a
  column-scoped INSERT" pinned the nine-column list and commented that `id` was withheld on purpose.
  It now reads ten, and the comment records why `id` moved and `created_at` did not.
- `tests/api/case-scoped-routes.test.ts` — the mechanical sweep gained a `NON_BODY_CASE_ROUTES` set,
  because the three document routes are parameterized but cannot have a `ROUTES` row: none has a
  JSON body. Pinned from both sides so it stays a decision rather than a hiding place. Its vacuity
  floor moved `> 3` → `> 2`, tracking the three routes that still resolve the actor's own case.
