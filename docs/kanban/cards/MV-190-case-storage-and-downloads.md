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
