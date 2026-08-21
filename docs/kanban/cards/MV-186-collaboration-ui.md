# MV-186 — Document collaboration UI (Stage 4 slice 4, PR 5C)

**Priority:** P1 · **Owner:** agent · **Created:** 2026-08-21

## Why

MV-182 shipped the chase list: a counsellor can ASK for a document. MV-185 gave a file a row.
MV-190 gave it a path and a way to read one. **Nothing can still receive a file, and nothing can
judge one.** The plan says so in its own words — "the chase list can ask for a document; nothing
can receive one" (`…2026-08-19-consultancy-workspace-ui-build.md` §1, "What is missing" item 3).

This is the slice that closes the loop, and it is the first time the product's central sentence —
*which student is submittable, and what single item blocks each* — rests on something a human
actually checked rather than on a counsellor's tick.

**Spec:** `docs/superpowers/specs/2026-08-20-case-document-collaboration.md` — **§7 first**
(D6–D10), then §2 (D1), §3 (D2), §6.2 (D5).
**Plan:** `…2026-08-19-consultancy-workspace-ui-build.md` §3, PR 5C.

## Scope

1. **`lib/cases/document-collaboration.ts`** — the pure five-state derivation (§7.1 D6) and its
   `(created_at, id)` comparator, plus the case-scoped reads and writes for versions and reviews.
2. **Two write routes.** `POST …/document-requests/[requestId]/versions` (multipart) and
   `POST …/document-versions/[versionId]/reviews` (JSON).
3. **One read route** (§7.4 D9). `GET …/document-versions/[versionId]/download` — without it the
   review verbs ask a counsellor to judge a file they cannot open.
4. **The Documents page.** Per-request state, version history, upload, accept / reject, download.
5. **MV-183's scope note corrected** (§7.3 D8), and its pinned test edited as a considered change.

## The correction this card exists to carry

**`case_document_requests.status` is lossy, and the loss points the chase at the wrong person.**
Three human states collapse into `outstanding` — nothing arrived, a file is awaiting OUR review,
and a file was rejected — and two collapse into `resolved`: a file a counsellor accepted, and a
request marked received by hand with no file at all (MV-182's verb, which §5's derivation
deliberately abstains on).

A page built on the column alone would tell a counsellor "outstanding" about a document sitting
in their own review queue. So the page derives its own five display states from the versions and
reviews it already reads. **It never writes `status`** — the `after insert` triggers do, and
`guard_document_request_status` refuses a contradicting hand-written value with `23514`.

## The fence

- **NO MIGRATION.** Every grant, policy, constraint and trigger this slice writes within is
  already applied, locally and in production. If it appears to need schema, that is a finding to
  **report, not a migration to write** — it would break the one-PR premise.
- **Both tables are APPEND-ONLY.** No UPDATE grant and no DELETE grant on either, and the
  migrations assert their absence. So **no "delete this version" and no "edit this review"** in
  either direction. A rejected file is superseded by a new upload; a mistaken review is corrected
  by writing another, and the newest one is the judgement.
- **`document_id` stays NULL** (§7.5 D10). Nothing in `documents` / `document_status`, and
  `documents_case_kind_idx` untouched — the same fence MV-182, MV-185 and MV-190 each held.
- No Stage 5 invitations (MV-187). No per-case visa-risk read (MV-188).
- **Imageless product body** (`docs/imagery-policy.md`) — no photography inside workspace
  surfaces. Design tokens exactly as CLAUDE.md specifies: sentence case, no gradients, no shadows.

## Acceptance criteria

1. A counsellor uploads a file against an outstanding request, and the request's status becomes
   whatever the trigger derives — never a value this slice wrote.
2. **The BYTES are uploaded before the row is inserted.** §6.2 rejected a trigger approach on the
   grounds that *the row must never outlive the bytes*: an orphaned object is harmless, a row
   pointing at nothing holds the request `outstanding` behind a file nobody can open, with no
   DELETE grant to retract it. The version `id` is client-generated so this ordering is possible.
3. A counsellor accepts or rejects a version, with an optional note, and the request resolves or
   stays outstanding **through the trigger**. A rejected request accepts a re-upload, which
   re-opens it.
4. **A linked student sees the history and the rejection note, and NO review verb and NO upload
   control.** RLS enforces it via `can_staff_case`; the UI must not render the verb either.
   Both halves tested.
5. Every version is downloadable through `mintCaseScopedDownloadUrl` and nothing else —
   `getSignedDocumentUrl` is not used (it takes no case and defaults to a 3600s TTL).
6. The five display states each render a distinct sentence, and `received-by-hand` never borrows
   the word "accepted".
7. MV-183's lodgement panel says what a resolved request now means, **without claiming the panel
   can tell an accepted file from one marked received by hand** — it reads requests only.
8. MV-182's manual "Mark received" verb is offered only for a request with **no versions**; once
   a version exists the guard trigger would refuse it, and a control that can only 403 is a
   control that should not be rendered.

## Test plan

- Pure derivation: each of the five states, the `(created_at, id)` tiebreak, and a re-upload after
  a rejection returning to `awaiting-review`.
- Route tests: authorize-before-write ordering; upload-before-insert ordering; the object is
  removed when the row insert fails; a denied case writes nothing and uploads nothing; a malformed
  path id is a 400 before any client exists.
- Component tests: staff render vs **student render** (no verbs, no upload); the append-only fence
  (no delete/edit control in any state); the manual resolve verb absent once a version exists.
- MV-183's panel: the new note pinned verbatim; the claim scan extended to `checked|reviewed` on
  the non-note prose; every other MV-183 assertion unchanged.
- Integration (`*.itest.ts`): the full request → upload → review → re-upload walk under real RLS,
  as the actor, with a positive control beside every denial.
- **Falsify every new guard** — revert the fix, watch the NAMED test go red, restore, record it.
  Check the fixtures can express the thing being tested (MV-190's all-digit uuid trap).

## Data

**None.** No migration. MV-185's tables and MV-190's `id` grant + `storage_path` CHECK are already
in production (applied 2026-08-21). This is the first Stage 4 slice with no gated production apply.

## Resume notes for a cold agent

- **Read spec §7 before anything.** The plan's 5C entry is one sentence and decides none of the
  reads; §7 decides them and supersedes it.
- The client generates the version uuid — `crypto.randomUUID()`, then `caseVersionObjectPath`,
  then upload, then insert with `id`. Order is load-bearing (criterion 2).
- Case ids are canonicalised to lowercase inside `caseObjectPath`. `z.uuid()` accepts uppercase
  and nothing upstream normalises; do not reintroduce a raw interpolation.
- `*.itest.ts` files skip silently without the three `SUPABASE_TEST_*` vars — **read the COUNT**.
  A crashed vitest worker reports as CLEAN (`Tests (N)`, tiny duration, `Worker exited
  unexpectedly`). On Windows run integration files ONE AT A TIME.
- Source-scanning tests split on `/\r?\n/` — the working tree is CRLF — and carry a vacuity floor.
- jsdom is blind to layout. Say plainly which claims are unverified rather than implying a visual
  pass happened.
