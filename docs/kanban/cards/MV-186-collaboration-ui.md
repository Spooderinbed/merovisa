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

---

## Built — 2026-08-21 (branch `mv-186-collaboration-ui`)

Spec pass first, as MV-185 and MV-190 both did: **spec §7** (D6–D10) records the decisions and
supersedes the plan's one-sentence 5C entry. **One PR** — there is no migration, so unlike 5B
there was no second decision point and no forcing function to split on.

### The decisions §7 took

**D6 — `case_document_requests.status` is LOSSY, and the loss points the chase at the wrong
person.** Three human states collapse into `outstanding` (nothing arrived / awaiting OUR review /
rejected) and two into `resolved` (a file accepted, or a request marked received by hand with no
file at all). The page derives its own five display states from the rows; it never writes
`status`, because the two `after insert` triggers do and `guard_document_request_status` refuses
a contradicting hand-written value with a `23514`.

**D7 — history is PER REQUEST, and the linked student reads it.** `request_id` is `not null`, so
per-request is structural. A student genuinely reaches this surface (`case.read` at `linked`
passes `openCaseRoute`), sees the history and the rejection note, and gets no upload control and
no review verb — enforced by `can_staff_case` at the database AND by the component, both tested.

**D8 — MV-183's scope note corrected.** See below.

**D9 — a THIRD route, named rather than smuggled in.** `mintCaseScopedDownloadUrl`'s only caller
resolves a `documents` row by id and cannot serve a `case_document_versions` row, so without a
download route the review verbs would ask a counsellor to judge a file they cannot open.

**D10 — `document_id` stays NULL.** `documents` is `UNIQUE (case_id, kind)`, so pointing a
version at the vault would silently REPLACE the student's current file for that kind. Version
history exists precisely so a file can arrive without overwriting anything.

### Gate

| gate | result |
|---|---|
| `npx tsc --noEmit` | **0 real errors** (only the known stale `.next/**` TS2307 noise) |
| `npm run lint` | **clean**, exit 0, zero warnings |
| `npm test` | **3785 passed / 383 files**, exit 0 |
| `npm run test:integration` | **926 passed, 0 test failures.** One file fails to COLLECT: `stage2-data-equivalence.itest.ts`, the pre-existing `.mjs`-shebang parse trap. Neither it nor `scripts/stage2/capture-read-path-snapshot.mjs` is in this branch's diff — verified with `git diff --name-only origin/master`. |

Integration ran against the local Docker stack with JWTs minted from the demo secret
(`npx supabase` is broken on win32 here). **The anon key was proved live before trusting a skip**:
a probe returned `42501 permission denied for table programs`, which is a real grant denial rather
than a rejected token, and `/auth/v1/health` returned 200. `Tests 6 passed (6)` on the new file —
the COUNT read, not just the absence of failures, and zero `Worker exited unexpectedly` on every
run.

### Mutation evidence — 25 mutants, each killing its own NAMED test

Every guard reverted, the suite run, the guard restored, and the restore re-asserted. Collected
counts read on every run because a crashed vitest worker reports as clean.

**Pure derivation (`lib/cases/document-collaboration.ts`) — 19 collected each run**

| mutant | red | named test killed |
|---|---|---|
| `id_tiebreak` | 2 | "breaks a timestamp TIE on id, descending" · "breaks a review timestamp TIE on id, descending" |
| `request_filter` | 1 | "ignores a version hung off a DIFFERENT request" |
| `review_parentage_filter` | 2 | "ignores a review of a DIFFERENT version" · "returns to awaiting-review when a NEWER version arrives after a rejection" |
| `by_hand_becomes_accepted` | 2 | "is received-by-hand when the request resolved with NO versions at all" · "never calls a received-by-hand request `accepted`" |
| `negative_decision_read` | 1 | "treats a decision that is not `accepted` as not accepted, mirroring the SQL" |

**Repository (`lib/cases/document-collaboration-repo.ts`) — 31 collected each run**

`version_case_filter` (2) · `path_bound` (1) · `case_keyed_only` (1) · `document_id_null` (1) ·
`row_ceiling` (1) · `decision_whitelist` (1) · `blank_note_is_null` (1) ·
`uploaded_by_provenance` (1). **`path_bound` and `case_keyed_only` kill DIFFERENT tests** — the
cross-case refusal and the owner-keyed refusal — which is what keeps "wrong case" separable from
"not case-keyed at all".

**Routes — 42 collected each run**

`insert_before_upload` (2) · `check_deferred_until_after_upload` (1) · `versions_gate_on_case_read`
(1) · `no_orphan_cleanup` (1) · `no_request_preread` (1) · `raw_case_interpolation` (1) ·
`reviews_gate_on_case_read` (1) · `reviews_skip_version_preread` (1) ·
`download_gates_on_write_claim` (1) · `download_mints_before_checking` (1).

**UI — 24 / 17 / 28 collected**

`student_gets_review_verbs` · `student_gets_upload_control` · `verbs_on_every_version` ·
`rate_limit_message_collapses` · `blank_note_sent_as_empty_string` · `window_open_without_noopener`
· `manual_verb_always_offered` · `panel_claims_documents_were_checked` — one named test each.

**Page — 11 collected.** `no_versions_outage_branch` killed both new outage tests.

**Integration, against the real database — 6 collected.** Removing the `id` tiebreak turned
"agrees that reviewing the OLDER of two tied versions leaves the request outstanding" red. This is
the mutant a unit test cannot run: the tie is a real microsecond-identical `created_at` written by
Postgres, not a string a test author typed.

### A mutant that killed NOTHING, and the fixture bug it found

**`raw_case_interpolation` first killed ZERO tests.** Replacing `caseVersionObjectPath(caseId,
versionId)` with a raw template literal left "writes an object key under the LOWERCASE case id
even when the path segment shouts" GREEN — because `CASE_ID` was `11111111-1111-4111-8111-…`,
**all digits, so `.toUpperCase()` was a no-op**. The fixture could not express the thing it was
testing. This is MISTAKES.md's MV-190 entry reproduced verbatim, one slice later.

Fixed by giving `CASE_ID` hex letters (`aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`), after which the
mutant kills exactly that one test. **A second fixture defect was found the same way**: `PDF_BYTES`
was 10 bytes and `verifyFileMagic` opens with `if (buffer.length < 12) return false`, so every
upload 422'd for its LENGTH and the signature check was never reached. Both are recorded as
comments beside the constants.

### How MV-183's lodgement copy changed, and why

The note read *"Read from document requests only. **Nothing here has been checked or approved**,
and the list is only as complete as the requests on it."* That clause was true when written and
**became false in one direction** the moment reviews shipped: a `resolved` request may now be one
whose file a counsellor accepted.

It now reads:

> Read from document requests only. A resolved request means a file was accepted or a counsellor
> marked it received by hand, and this panel does not say which; the list is only as complete as
> the requests on it.

**The correction does not swing the other way, for a mechanical reason.** The panel reads
`case_document_requests` and nothing else — `readCaseLodgement` → `listCaseDocumentRequests` →
`deriveLodgement` — and never loads a version or a review. So from `status = 'resolved'` alone it
**cannot tell an accepted file from one marked received by hand**, and it says so rather than
naming only the flattering meaning. That would have been MV-144 again.

Three things deliberately did NOT move: the completeness clause (reviews gave Stage 4 no truthful
denominator, so §3's ban on a percentage, an "x of y" and a progress bar stands and its three
tests are untouched); the state words (`clear` stays "Nothing outstanding", because a rejected
file derives `outstanding`); and every other assertion in the pinned test file.

**The claim scan GAINED a clause rather than losing one.** It now also refuses `checked` and
`reviewed` in the panel's non-note prose — `\bchecked\b`, not `check`, because the outage line
legitimately says "We couldn't CHECK this case's document requests". A mutant that made the
settled sentence claim documents "have been checked" goes red on it.

### Acceptance criteria

1. **Met.** Upload against an outstanding request; `status` is written by the trigger and by
   nothing this slice wrote — asserted at the route (`serverClient.from` never called) and against
   the real database in the walk.
2. **Met.** Bytes before row, asserted on ORDER and not merely on both happening; a failed insert
   removes the object it named, asserted against the key the UPLOAD used rather than a constant.
   The reverse-order mutant goes red.
3. **Met.** Accept / reject with an optional note; a rejected request accepts a re-upload which
   re-opens it — walked end to end against Postgres.
4. **Met, both halves.** RLS refuses the student (MV-185's suite); the component renders them no
   verb, no upload control and no note field, and two mutants prove those tests bite.
5. **Met.** Every download goes through `mintCaseScopedDownloadUrl`. `getSignedDocumentUrl` is
   **not used and was left in place** — see "deliberately not done" below.
6. **Met.** Five distinct words and five distinct sentences, pinned; `received-by-hand` never
   contains "accept" in either its word or its sentence, and the component render is scanned too.
7. **Met.** See the copy section above.
8. **Met.** "Mark received" is offered only while `versionCount === 0`; the integration walk
   confirms the guard trigger really does raise `23514` once a version exists, so the UI rule is
   backed by the database rather than being a style choice.

### Things built that the card did not name

- **A third route** (D9), argued in the spec rather than slipped in.
- **`lib/documents/upload-limits.ts`.** The 5MB cap and the mime allow-list were local consts in
  the vault's upload route; a second uploader made them a drift hazard. They could NOT be shared
  through `lib/documents/upload-validation.ts` — `tests/api/documents/upload.test.ts` mocks that
  module wholesale, so a new export the vault route imported failed to resolve at import time
  (measured). A separate module is unmocked, so both routes read the real values and **no existing
  assertion moved**, which is what MV-190's criterion 6 asks for.
- **The permission check moved ABOVE `formData()`** on the upload route. `tests/api/case-denial.test.ts`
  requires every case-gated route to answer 403 with zero queries and zero Storage calls, and a
  route that parsed the body first would answer 400 to a denied caller and never reach its own
  gate. It is also the better order on its own terms: a 5MB body is not worth buffering for
  somebody we are about to refuse.
- **Three rows in `tests/api/case-denial.test.ts`** and **two entries in
  `lib/supabase/service-role-exceptions.ts`** (`sanctioned`, "storage administration"), because the
  upload and download routes construct the admin client for Storage and the ESLint fence is
  machine-enforced. **Neither route uses service-role for a TABLE** — the version row is written on
  the authenticated client through MV-185's five conjuncts, and both entries say so.

### What this slice deliberately did NOT do

- **No migration.** Every grant, policy, constraint and trigger it writes within was already
  applied to production on 2026-08-21. **Nothing here needs a production apply**, which makes this
  the first Stage 4 slice with no gated data step.
- **No delete-a-version and no edit-a-review control**, in either direction, in any state — a
  named test sweeps every state's buttons for `delete|remove|edit|undo|change`.
- **Nothing in `documents` / `document_status`**; `document_id` written NULL (D10);
  `documents_case_kind_idx` untouched.
- **`getSignedDocumentUrl` was NOT removed.** The card licensed removing it if nothing else calls
  it, and nothing does — every other hit is a stale `.claude/worktrees/` copy. It was left alone
  because deleting an export is the one change in this diff with no test that could go red for the
  right reason, and it belongs in a cleanup that is not also shipping a feature. Recorded here so
  the next slice can take it deliberately.
- **No Stage 5 invitations** (MV-187), **no visa-risk read** (MV-188), no activity feed, no
  notification, no extraction.
- **The at-mint audit event** is still owed, as it is for MV-190's two entries.

### NOT VISUALLY VERIFIED — stated plainly rather than implied

jsdom has no layout engine, and **the browser pane cannot render in a non-interactive session**:
screenshots time out and every `getBoundingClientRect()` reads 0. So **no live browser pass was
performed on this slice**, and the following are unverified by anything in this PR:

- Layout of the version-history list inside a request card at desktop AND at 375px, including
  whether a long `original_name` wraps or overflows its row.
- The file input's rendered appearance — `file:` pseudo-element styling is not exercised by jsdom
  at all.
- Contrast of `bg-possible-tint`/`text-possible-ink` and the strong/reach pairs on the new
  progress pill, in light and dark.
- Whether the collaboration block makes an already-long chase list too dense to scan.
- Dark mode on every new surface.

Everything asserted above is structure, copy, ordering, permissions and data — the things jsdom
and Postgres CAN see. The plan's "a live browser pass is mandatory" rule for UI slices is
**outstanding on this card** and should gate the merge, not the PR.
