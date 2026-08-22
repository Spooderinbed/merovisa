# Case document collaboration — the 5B spec pass

**Date:** 2026-08-20 · **Lane:** consultancy workspace UI ·
**Plan:** `docs/superpowers/plans/2026-08-19-consultancy-workspace-ui-build.md` §3, PR 5B
**Status:** spec complete; 5B carved as **MV-185** (schema) then **MV-190** (Storage + routes).
§7 adds the **MV-186** (5C, the UI) pass — no migration, no further split.

The plan required "a written spec pass" before 5B could be carved, and said it would
"likely split again". It splits in two, and the spec pass also found **two stale premises
in the plan's own 5B entry**. Both are recorded in §1 because they change what gets built.

---

## 1. Two things the plan says that are no longer true

### 1.1 "case-scoping the three existing routes" — already done

`app/api/documents/upload`, `.../[id]/view` and `.../[id]` were case-scoped by MV-157 §G.
Each one authorizes the case through the authenticated client *before* any Storage call and
then filters the row by `case_id`:

- `[id]/route.ts:25` — "Authorize the case BEFORE reading the row, then scope the read by `case_id`."
- `[id]/view/route.ts:35` — "User-scoped client respects RLS; the `case_id` filter is what selects the row."
- `upload/route.ts:74` — `checkCasePermission(userId, caseId, "case.update", supabase)`.

**The actual gap is different and narrower.** All three resolve *the actor's own* case —
`upload/route.ts:70` calls `resolvePersonalCaseId(userId, supabase)`. A counsellor cannot act
on a student's case through any of them, because there is no way to name a case. So 5B's route
work is **"accept a named case id and authorize it"**, not "add case scoping". This is the
same shape as the standing F-8 finding (five case-scoped write routes resolve the actor's own
case); 5B closes it for the three document routes only.

### 1.2 "the versions/reviews schema replacing the one-per-kind model" — replacing is the wrong verb

MV-182's migration header states the intent as *"the eventual Stage 4 model is requests ->
versions -> reviews and the uniqueness has to go once, on purpose, with the whole model behind
it"*. This spec **keeps** `documents_case_kind_idx` and adds the model beside the vault, for a
reason the header could not have weighed: see §2.

---

## 2. Decision D1 — versions sit BESIDE the vault, not inside it

`public.documents` carries `UNIQUE (case_id, kind)` as `documents_case_kind_idx`
(`…20260802120000….sql:157`). Dropping it costs more than it looks:

1. **Every `.upsert()` on `documents` stops planning.** supabase-js compiles an upsert to
   `INSERT … ON CONFLICT DO UPDATE`, and the arbiter index must exist and be FULL. Removing
   the index breaks `upsertDocument` and `app/api/documents/upload`'s atomic replace at plan
   time, not at review time (MV-155/MV-168 measured this failure three times).
2. **`documents` is the student product's vault.** `lib/checklist/generator.ts` derives "have"
   from uploaded kinds, and profile sections read it. "The current file for this kind on this
   case" is a fact the student version depends on; turning `documents` into an append-only
   version log makes that fact a query, and every student surface has to learn it.
3. **The consultancy model does not need the uniqueness gone.** It needs *history* and
   *review*, both of which are facts about a request, not about the vault.

**Decision:** `case_document_versions` and `case_document_reviews` are new tables beside the
vault, the way MV-182 put `case_document_requests` beside it. `documents` is untouched — no
column, no policy, no grant, no index — exactly as MV-182 constrained itself.

The vault keeps meaning "the current file for this kind on this case". A version row optionally
carries `document_id` when a version *is* the vault's current file; version history survives in
the new table when the vault row is later replaced. **The uniqueness is not dropped in this
lane at all**, and the plan's 5B line should be read as superseded by this paragraph.

---

## 3. Decision D2 — the two tables

```
case_document_versions
  id, case_id, organization_id, request_id -> case_document_requests(id)
  document_id -> documents(id) on delete set null      -- null once the vault moves on
  storage_path text not null                            -- case-keyed; see §4
  file_size, original_name, content_type
  uploaded_by -> auth.users(id) on delete set null
  created_at
  -- NO unique on (request_id): re-upload after a rejection is the point of the model.

case_document_reviews
  id, case_id, organization_id, version_id -> case_document_versions(id)
  decision text check (decision in ('accepted','rejected'))
  note text
  reviewed_by -> auth.users(id) on delete set null
  created_at
```

Carrying `case_id` **and** `organization_id` on both tables copies MV-182's shape so the
existing `%_case` census, the `cases_write_surface_guard` trigger idiom and the tenant-axis
policies all apply unchanged.

**Both tables inherit MV-182's two forbidden grants verbatim:** no `UPDATE (case_id)` and no
`UPDATE (organization_id)`, because either re-points a live row into another case or another
tenant. Assert both at apply time the way MV-182 §5 does.

**Request resolution is derived, never a second source of truth.** A request is resolved when
its newest version has an `accepted` review. `case_document_requests.status` stays the column
MV-183's lodgement read already reads; the review verb writes it in the same statement that
inserts the review, and a test pins that the two never disagree.

### What this does NOT do

- No case-activity feed. No extraction on counsellor uploads. No notification.
- **No dependency on Stage 5.** `cases.student_user_id` is nullable — "not yet claimed"
  (`…stage1_tenancy_core.sql:80`) — and nothing here reads it. A counsellor can request,
  upload and review on an unclaimed case. 5B genuinely precedes MV-187.

---

## 4. Decision D3 — Storage, and why it is its own card

`upload/route.ts:65-69` pins the current state deliberately:

> the object path below stays OWNER-keyed. Case-aware Storage paths are Stage 4 (spec §8): a
> `<case_id>/…` object matches the live `(storage.foldername(name))[1] = auth.uid()::text`
> policy for NOBODY, so moving it here would force the Stage 4 policy rewrite into Stage 2
> without its authorization model.

5B is where that authorization model arrives. Three consequences:

1. **New case-collaboration objects are case-keyed**: `case/<case_id>/<version_id>`. A new
   prefix, so nothing existing moves.
2. **Existing owner-keyed vault objects are NOT migrated.** They are live student PII in
   production; a copy-and-rewrite of `documents.file_path` is a data-loss-shaped operation with
   no reason to run. Counsellor access to a vault file goes through a **short-TTL signed URL
   minted server-side after our own case authorization** — signed URLs bypass Storage RLS by
   design, which is precisely why the authorization must happen before minting, in our code,
   and be tested there.
3. **A case-scoped `storage.objects` policy is still added** for the `case/` prefix, so direct
   client access is bounded even though today every write goes through the service role. This
   is defence in depth, not the primary gate.

This is a migration touching `storage.objects` plus three routes plus a signed-download helper
— a different risk class from §3's additive tables, with its own rehearsal and its own
production apply. **That is the split.**

---

## 5. The carve

| Card | Ships | Data |
|---|---|---|
| **MV-185** | `case_document_versions` + `case_document_reviews`: tables, RLS, column-scoped grants, the two forbidden-grant assertions, request-resolution derivation. No routes, no Storage, no UI. | New migration; local → rehearsed → production as its own gated step. |
| **MV-190** | `case/<case_id>/…` prefix + its `storage.objects` policy; short-TTL signed-download helper; the three document routes accept a NAMED case id and authorize it (closes F-8 for these three). | New migration touching `storage.objects`. Own rehearsal, own gated apply. |

MV-190 is sequenced immediately after MV-185 and **before** MV-186 (5C, the UI). The number is
higher only because MV-186–189 were already reserved by the plan; the order is the table above.

### Test obligations carried from the plan, unchanged

- Unauthorized upload / view / download / review denial per §7.
- **RLS mutation tests, not denial-only probes** — a denial-only suite passes identically
  against a missing policy.
- Policy→verb bindings asserted with `polcmd::text`.
- The `%_case` census left undisturbed (MV-182's card names the seven exact-count guards).
- Request → version → review state transitions, including re-upload after rejection.

### Added by this spec pass

- A test that `case_document_requests.status` and "newest version has an accepted review"
  cannot disagree.
- A test that a signed download is refused *before* the URL is minted when the actor cannot
  staff the case — asserted on the mint call, since the URL itself bypasses RLS.
- A test that an unclaimed case (`student_user_id is null`) supports the full
  request → upload → review walk.

---

## 6. The MV-190 spec note — two more premises that did not survive measurement

**Date:** 2026-08-21 · **Card:** `docs/kanban/cards/MV-190-case-storage-and-downloads.md`

§1 exists because the plan's 5B entry carried two stale premises. Writing them down is why MV-185
went smoothly, so MV-190 gets the same pass. Both premises below are **this spec's own**, measured
against the live production catalogue and re-measured identically against the local stack.

### 6.1 Decision D4 — MV-190 adds NO `storage.objects` policy. §4 (3) is superseded.

§4 (3) says "a case-scoped `storage.objects` policy is still added … for the `case/` prefix … This
is defence in depth". Measurement says it would be defence in *breadth*. These are the only three
policies on `storage.objects`, in production and locally:

| policy | cmd | roles | expression |
|---|---|---|---|
| `Service uploads document files` | INSERT | `service_role` | `bucket_id = 'documents'` — no path check |
| `Users read own document files` | SELECT | PUBLIC | `bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text` |
| `Users delete own document files` | DELETE | PUBLIC | the same expression |

There is no UPDATE policy. RLS on `storage.objects` is **enabled but not forced** — Supabase-managed,
and left alone. Bucket `documents` is private, with no size limit and no mime allowlist. Four things
follow, and together they invert §4 (3):

1. **Writes already run as `service_role`.** `app/api/documents/upload/route.ts` reaches Storage
   through `createSupabaseAdminClient()`, which bypasses RLS outright. A `case/…` object therefore
   needs no new INSERT policy to be *written*.
2. **A `case/<case_id>/…` object is already unreadable by `authenticated`.** `foldername[1]` is the
   literal `case`, which is not a uuid and so equals no `auth.uid()`. Deny-by-default is not a gap
   here; it is the correct answer already in place.
3. **Every counsellor read is a signed URL minted after our own authorization.** A signed URL bypasses
   Storage RLS by design (§4 (2)), so the gate is `checkCasePermission` in our code, not a policy.
4. Therefore a new SELECT policy admitting `authenticated` to the `case/` prefix would be a **second
   path to the same bytes, and the weaker one**: it would have to restate "may this actor staff this
   case" as a policy expression, and any drift between that expression and `checkCasePermission` is a
   hole with no failing test pointing at it. A second layer only adds depth when it is not looser
   than the first.

**Decision: no new policy.** The absence is defended two ways rather than asserted in prose:

- **A test, with a control.** Acceptance criterion 5 becomes: a direct `authenticated` Storage read
  of `case/<case_id>/<version_id>` is refused, *and the same actor in the same test run can read
  their own uid-keyed object* — without the control a false "denied" (a wrong bucket, an unseeded
  fixture, a broken client) is undetectable.
- **A mutant that ADDS.** For an absence the mutant is an addition, not a deletion:
  `supabase/rehearsal/MV-190-mutation.sql` plants a permissive `case/`-prefix SELECT policy and the
  criterion-5 test must go red. A denial test that survives that mutant was never testing anything.
- **An apply-time assertion.** MV-190's block refuses if any `storage.objects` policy admits a role
  other than `service_role` without keying on `auth.uid()` — so a later migration cannot re-add the
  policy this note declined without tripping it.

### 6.2 Decision D5 — `case/<case_id>/<version_id>` is unwritable as MV-185 granted it

MV-185 granted `insert (case_id, organization_id, request_id, document_id, storage_path, file_size,
original_name, content_type, uploaded_by)` on `case_document_versions`. **`id` is not in that list**,
and §8 (5) asserts there is no UPDATE grant on the table at all. So a client can neither know the
version id at insert time nor fill `storage_path` in afterwards: the path the spec documents cannot
be written by the policy-gated path MV-185 built. Measured on both catalogues.

**Decision: add `id` to the INSERT grant.** The caller generates the uuid and writes `id` and
`storage_path` consistently in one statement. Writes stay policy-gated and both tables stay
append-only. Three alternatives were weighed and rejected:

- **Insert the version on the admin client** so the server issues the id. This bypasses the
  five-conjunct INSERT policy that is the whole reason MV-185 exists, and its §7 names each conjunct
  as a distinct hole. Rejected.
- **An independently generated suffix** instead of the version id. Leaves `storage_path` free text
  with nothing tying it to its row, and changes §4's documented path for no gain. Rejected.
- **A `before insert` trigger that computes `storage_path` from the server-issued id**, so neither
  `id` nor `storage_path` need granting at all. This is the tidiest-looking option and it is the one
  that decides the question — against itself. See below.

#### Why the trigger loses: the row must never outlive the bytes

The trigger option forces the caller to insert the row *first*, because that is the only way to learn
the path. So the sequence becomes insert → upload, and a failed upload leaves a **version row
pointing at an object that does not exist** — with no DELETE grant to retract it. MV-185's derivation
reads the newest version of a request, so that phantom row would hold the request `outstanding`
behind a file nobody can open, and the only repair would be a service-role write to a tenant table.

A client-generated id inverts the sequence: **upload the bytes, then insert the row.** A failed upload
writes no row at all, and a failed insert leaves an orphaned object that no row references — the
cheaper of the two failures by a wide margin, and the same trade `app/api/documents/upload/route.ts`
already makes deliberately for the vault (it uploads to a fresh uuid path before it touches the row,
and removes the object again if the row write fails). MV-185's stated reason for withholding `id` —
"an id the client chose is not a key the server issued" — is a sound default, and this is the case
that outweighs it: the id is not identity here, it is a *name for bytes that must exist first*.

Nothing else rests on `id` being server-issued. Uniqueness is the primary key's; provenance is
`uploaded_by = auth.uid()`; tenancy is the five conjuncts plus the constraint below. A colliding uuid
is a `23505` on an unguessable value, and the path is never reachable without an authorized mint
(6.1), so a *guessable* id buys nothing either.

#### What granting `id` costs, and the bound that pays for it

A client-chosen `id` is not itself a widening — the five conjuncts still bind and a colliding uuid is
a `23505` on an unguessable value. What it completes is client control of `storage_path`, and MV-185
shipped that column deliberately unconstrained:

> there is deliberately NO check constraint on the shape here, because pinning the prefix in this
> file would decide MV-190's authorization model from a slice that ships none.
> — `…20260821120000….sql:87-89`

**That is the hole this card closes.** A counsellor staffing case X can insert a version *on case X*
whose `storage_path` reads `case/<case_y>/…`. MV-190's helper authorizes the **case** and then signs
the **path**; with an unbounded path, a legitimate authorization on case X mints a URL for case Y's
bytes. This is exactly MV-161's finding — the one MV-185 applied to `document_id` before the fact
(§7 conjunct 4) — landing on the column MV-185 left open on purpose, in the slice it left it for.

So MV-190 adds a **table CHECK**, not a policy conjunct:

```sql
check (storage_path like 'case/' || case_id::text || '/%')
```

Three reasons for a constraint over a conjunct:

1. **It binds every role, `service_role` included.** A policy binds `authenticated` only, and the
   upload half of this model reaches Storage on the admin client.
2. **It does not touch MV-185's policy.** `supabase/rehearsal/MV-185-mutation.sql` restates that
   policy byte-for-byte and *restores by re-running MV-185's migration*. A sixth conjunct added here
   would be silently reverted by any later MV-185 rehearsal, with nothing going red.
3. **`like`, not `=`.** The prefix is the security property. Pinning the entire string
   (`= 'case/' || case_id || '/' || id`) would additionally forbid two versions on one case naming
   the same object — but **that aliasing gains no privilege**: both objects sit inside one case, and
   anyone authorized to download the second is by construction authorized to download the first. It
   is a data-integrity confusion, which the builder below prevents, not a boundary. Against that, the
   exact form forecloses a file extension for no gain (`content_type` is a column on this table,
   which is why the vault's owner-keyed paths carry an extension and these do not) and would force an
   edit to MV-185's own fixture. The exact `case/<case_id>/<version_id>` shape is produced by
   `caseVersionObjectPath()` and pinned by a unit test; the constraint is the floor under that
   helper, not a restatement of it. (A uuid rendered as text contains no `%` or `_`, so the pattern
   carries no wildcard hazard.)

#### MV-185's §8 (4) is NOT amended — the predicted conflict does not exist, and the real one is worse

The card predicted that MV-185's §8 (4), which pins the versions INSERT column list as an exact
string, "will make your own migration fail at apply time". **Measured on the local stack: it does
not.** MV-185's `do $$` block runs at MV-185's timestamp, before MV-190's grant exists, so an
ordered replay asserts nine columns against nine and passes. MV-190 then applies cleanly with
MV-185 untouched — verified by applying it twice, both times exit 0.

What the measurement *did* surface is a sharper hazard the card did not predict, found by re-running
MV-185's migration against the post-MV-190 schema:

```
-- after MV-190:      …, file_size, id, organization_id, …
-- re-run MV-185's migration alone, then read the grant again:
--                    …, file_size, organization_id, …          <-- `id` is gone
```

MV-185's §6 opens with `revoke all on public.case_document_versions from anon, authenticated;` and
re-grants its own nine columns. **So re-running MV-185 silently reverts MV-190's grant** — and its
§8 (4) then passes, because MV-185 has just restored the very state it asserts. No assertion edit in
either file can catch this; the `revoke` is the problem, not the pin. (The CHECK constraint survives
the same re-run, because nothing in MV-185 drops it.)

This matters because `supabase/rehearsal/MV-185-mutation.sql` **restores by re-running MV-185's
migration**. Left alone, every future MV-185 rehearsal would quietly un-grant `id` and leave the
collaboration path unwritable again. Three things follow, and none of them is editing an applied
migration's history:

1. **The restore for an MV-185 mutant is now two files, in order** — MV-185's migration, then
   MV-190's. MV-190's file re-grants *and* re-asserts, so a restore that did not restore refuses
   instead of passing quietly, which is the property MV-185's harness already claims for itself.
   Both harness headers say so.
2. **The revert is loud, not silent, because a gating test names it.**
   `tests/integration/stage4-case-storage.itest.ts` opens with "grants `id` on the versions INSERT",
   which goes red the moment the grant is reverted and MV-190 is not re-applied.
3. **MV-185's file is left byte-identical to what was applied to production.** Rewriting an applied
   migration to grant `id` at MV-185's timestamp would make the repo claim something about
   production that is not true of it.

The one MV-185 artefact that *does* change is a test, named in the next paragraph — because an
assertion about the live schema has to track the live schema.

**One MV-185 assertion is edited, and it is named here rather than buried in a diff.**
`tests/integration/stage4-document-collaboration.itest.ts` — "grants exactly SELECT and a
column-scoped INSERT" — asserts the nine-column list and carries the comment *"`id` and `created_at`
are absent on purpose: an id the client chose is not a key the server issued"*. That assertion now
reads ten columns and the comment now records why `id` moved and `created_at` did not. This is the
only existing assertion MV-190 changes; the student vault suite (`upload` / `view` / `[id]`) is
untouched, which is what acceptance criterion 6 asks for.

### 6.3 What MV-190 ships, restated

1. `caseVersionObjectPath(caseId, versionId)` → `case/<case_id>/<version_id>`, plus the CHECK
   constraint and the `id` grant that make it writable through the policy-gated path.
2. `mintCaseScopedDownloadUrl(...)` — a signed-download helper that **performs the case
   authorization itself**, so "authorized before minted" is true by construction rather than by
   convention. The TTL is an exported number and a test asserts the number.
3. The three document routes accept a **named** case id through `resolveTargetCase` and authorize
   it — closing F-8 for these three only. When no case is named, behaviour is byte-identical to
   today, including the owner-keyed object path.

### What §6 does NOT do

- No `storage.objects` policy (6.1), and no migration of existing owner-keyed vault objects.
- Nothing in `documents` or `document_status`. `documents_case_kind_idx` survives, still asserted.
- No route that writes a version row — that is MV-186's. MV-190 makes the path *writable* and
  *readable*; it does not add the writer.

---

## 7  The MV-186 spec note — the UI, and the three questions the plan never asked

**Date:** 2026-08-21 · **Card:** `docs/kanban/cards/MV-186-collaboration-ui.md` · **Plan:** §3, PR 5C

The plan's entire 5C entry is one sentence — *"the collaboration UI. Upload, version history,
review verbs on the Documents page."* That sentence names three controls and decides nothing
about what the surface SAYS, which is the half this repo has twice had to rework (MV-143's
abstain gate, MV-144's accuracy meter). §1 and §6 each paid for themselves by overturning a
stale premise before a line was written; this pass does the same for the reads.

**MV-186 carries no migration.** The schema is live locally and in production (MV-185 applied
2026-08-21; MV-190's grant and CHECK apply with it). Everything below is routes, components and
copy, built inside grants that already exist. There is no second decision point, so unlike 5B
this slice does not split.

### 7.1 Decision D6 — a request has FIVE display states, and `status` can only express two

`case_document_requests.status` is `outstanding | resolved`, and
`private.document_request_derived_status` writes it from the newest version's newest review.
That column is correct and stays the one MV-183's panel reads. **It is also lossy**, and the
loss is exactly the thing a counsellor opens this page to see:

| what actually happened | derived `status` | who is it waiting on? |
|---|---|---|
| nothing has arrived | `outstanding` (untouched — the derivation abstains) | the student |
| a file arrived, nobody has judged it | `outstanding` | **us** |
| a file arrived and was REJECTED | `outstanding` | the student, again |
| a file arrived and was ACCEPTED | `resolved` | nobody |
| no file ever arrived; a counsellor marked it received by hand (MV-182's verb) | `resolved` | nobody |

Three different sentences collapse into `outstanding`, and two into `resolved`. A chase list
built on the column alone would tell a counsellor "outstanding" about a document sitting in
their own review queue — the single most useless thing this page could say, because it points
the chase at the wrong person.

**Decision:** the page derives its own display state from the versions and reviews it already
reads, in a pure module (`lib/cases/document-collaboration.ts`), in the same shape MV-183 used
for lodgement — the repo fetches, the pure module decides, the component renders. Five states:

- `awaiting-upload` — no versions. "Nothing has arrived yet."
- `awaiting-review` — the newest version carries no review. "Waiting on your review."
- `rejected` — the newest version's newest review is `rejected`. The note is shown; a re-upload
  is the answer, never an edit.
- `accepted` — the newest version's newest review is `accepted`.
- `received-by-hand` — `status = 'resolved'` with **no versions at all**. It is NOT `accepted`
  and must never borrow that word: nobody checked a file, because there is no file. This state
  exists because MV-182's manual verb is still live and §5's derivation deliberately abstains
  on it.

**"Newest" is `(created_at, id)` descending, in the client too.** The database derivation says
so for the same reason — two rows written in one statement share a timestamp — and a UI that
sorted differently would render a state the trigger disagrees with. One comparator, restated in
the pure module and pinned by a test against the ordering the SQL states.

**The derivation is never re-implemented as a write.** Nothing in this slice writes
`case_document_requests.status`; the two `after insert` triggers do, and
`guard_document_request_status` refuses a contradicting hand-written value with `23514`. The
manual "Mark received" verb MV-182 shipped stays, and is offered **only for a request with no
versions** — once a version exists the guard would refuse it, and a control that can only 403 is
a control that should not be rendered.

### 7.2 Decision D7 — version history is PER REQUEST, and the linked student reads it

**Per request, not per case.** `case_document_versions.request_id` is `not null` — §3 states
that a version with no request is what the vault is for — so history is per-request by
construction. A flat per-case list would be a second ordering of the same rows with the request
context stripped, and the chase list is the spine this whole model hangs off.

**What each actor sees.** This is not hypothetical: a linked student holds `case.read` at
`linked`, so `openCaseRoute` ADMITS them to `/workspace/<org>/students/<caseId>/documents` if
they have the URL. `grantedRoles` is empty for them (no membership row), so `isStaffOnCase` is
false — which is the gate the page already uses for MV-182's controls.

| | counsellor / admin / owner | linked student |
|---|---|---|
| version history, filenames, dates | yes | **yes** — `_select_actor` rides `actor_case_ids()` |
| review decisions and the rejection **note** | yes | **yes** — §7's policy comment calls this "the half of this model that is any use to them" |
| upload a version | yes | **no** — `can_staff_case` |
| accept / reject | yes | **no** — `can_staff_case`, "the card's headline" |
| download a version | yes | yes — both go through `mintCaseScopedDownloadUrl` |

**Belt and braces, and both halves tested.** RLS refuses a student's insert whatever the UI
does; the UI must also not RENDER a verb whose only possible outcome is a 403. A control that
appears and then fails is worse than an absent one — it tells the person they were allowed.
So the components take `canReview` / `canUpload` as props computed on the server, and a named
test asserts that a student render contains no review verb and no upload control.

### 7.3 Decision D8 — MV-183's lodgement copy, and the exact sentence that became false

`components/workspace/submittability-panel.tsx` carries:

> Read from document requests only. **Nothing here has been checked or approved**, and the list
> is only as complete as the requests on it.

The bolded clause was true when it was written and **is now false in one direction**: after this
slice, a `resolved` request may be one whose file a counsellor accepted — which is precisely
"checked". Leaving it would be under-claiming, which is a smaller sin than over-claiming but is
still the panel saying something untrue about its own data.

**The correction must not swing the other way, and the reason is mechanical.** The panel reads
`case_document_requests` and NOTHING else — `readCaseLodgement` → `listCaseDocumentRequests` →
`deriveLodgement`. It never loads a version or a review. So from `status = 'resolved'` alone the
panel **cannot tell an accepted file from a request marked received by hand** (D6's last two
rows). "Every document has been checked" is therefore not a sentence this panel is entitled to,
and giving it one would be MV-144 again.

**Decision — the note becomes:**

> Read from document requests only. A resolved request means a file was accepted or a counsellor
> marked it received by hand, and this panel does not say which; the list is only as complete as
> the requests on it.

Three properties are preserved deliberately:

1. **The completeness clause survives verbatim in meaning.** There is still no denominator —
   nothing in the schema knows which documents a case actually needs — so §3's ban on a
   percentage, an "x of y" and a progress bar is untouched, and its three tests stand unchanged.
2. **The state words do not move.** `clear` stays "Nothing outstanding", not "Ready to lodge":
   a rejected file derives `outstanding`, so `clear` still means every request resolved, and the
   settled sentence "Every document this case has been asked for has arrived" stays true of
   both resolved kinds. Reviews raise what a request MEANS; they do not hand the panel a
   case-level verdict it still has no data for.
3. **The claim scan stays, and gains a clause.**
   `tests/components/workspace/submittability-panel.test.tsx` scans every rendered line for
   `ready|verified|approved|submittable|lodged` with `[data-lodgement-scope]` excluded, because
   in the note those words appear as a DENIAL. The note is still the only exclusion and is still
   pinned verbatim. **Added:** the panel's non-note prose must not claim a document was
   *checked* or *reviewed* either — a word the new note introduces, and therefore a new way for
   the claim to leak into the prose.

This is a considered edit to a pinned test, not a green-ification. The old string is replaced
because the sentence it pinned is no longer true; every other assertion in that file is left
exactly as MV-183 wrote it.

### 7.4 Decision D9 — a THIRD route, and why version history is useless without it

The card names two write routes. A third, read-only, is required and is named here rather than
smuggled in: **`GET …/document-versions/[versionId]/download`**.

MV-190 shipped `mintCaseScopedDownloadUrl` and one caller, `app/api/documents/[id]/view`, which
resolves a **`documents`** row by its id. It cannot serve a `case_document_versions` row — a
different table, a different id, and a `storage_path` the vault has no column for. So without
this route the helper MV-190 built has no path to a collaboration object at all, and the review
verbs would ask a counsellor to accept or reject a file they cannot open. That is not a
judgement; it is a coin toss with an audit trail.

It adds no new authorization surface: it reads the version row on the AUTHENTICATED client
filtered by `case_id` (so RLS answers first), then hands the row's `storage_path` to the helper,
which performs `checkCasePermission` itself and bounds the path to the case. The same two gates,
in the same order, as `[id]/view`.

### 7.5 Decision D10 — `document_id` stays NULL in this slice

`case_document_versions.document_id` is nullable and bounded to the case by the INSERT policy's
fourth conjunct. It exists for the case where a version *is* the vault's current file (§2).

**This slice writes `null` and never sets it.** Making a counsellor's upload also become the
vault's current file for its kind is a second decision with its own consequences: `documents` is
`UNIQUE (case_id, kind)`, so it would silently REPLACE whatever the student uploaded, and
`lib/checklist/generator.ts` and the profile sections read that row. Version history exists
precisely so a file can arrive without overwriting anything. Wiring the vault is a product
decision about whose file is canonical, it is not needed for upload → review → resolve to work,
and §2 already fenced this lane out of `documents`. It stays unbuilt until something asks for it.

### 7.6 What MV-186 ships, restated

1. `lib/cases/document-collaboration.ts` — the pure five-state derivation (D6) and its
   comparator, plus the repo reads and writes for versions and reviews on one case.
2. **Two write routes**: `POST …/document-requests/[requestId]/versions` (multipart; validates,
   uploads the BYTES FIRST, then inserts the row with a client-generated `id`), and
   `POST …/document-versions/[versionId]/reviews` (JSON; `accepted` | `rejected`, optional note).
3. **One read route** (D9): `GET …/document-versions/[versionId]/download`.
4. The Documents page: per-request state, version history, upload, accept / reject, download.
5. MV-183's scope note corrected (D8), and its test edited as a considered change.

### What §7 does NOT do

- **No migration.** Every grant, policy, constraint and trigger it writes within is already
  applied. If this slice appears to need schema, that is a finding to report, not a migration
  to write.
- **No Stage 5 invitations** (MV-187) and **no visa-risk read** (MV-188).
- **Nothing in `documents` / `document_status`**, and `documents_case_kind_idx` untouched — the
  same fence MV-182, MV-185 and MV-190 each held. D10 is the sharp edge of it.
- **No delete-a-version and no edit-a-review control**, in either direction. Both tables are
  append-only to a client and §6 grants no UPDATE and no DELETE on either; a rejected file is
  superseded by a new upload, and a mistaken review is corrected by writing another one. A UI
  offering either verb would be offering a `42501`.
- **No case-activity feed, no notification, no extraction** — §3's list, unchanged.

## 8  The MV-189 spec note — document access audit events, and the clause that 18 entries satisfy between them zero times

The plan does not offer auditing as a refinement. It is a **condition of the exception itself**:
service-role is reduced to "a short, enumerated exception list … where every entry is named,
justified, preceded by an explicit case authorization check, **and audited**" (plan line 342).

`lib/supabase/service-role-exceptions.ts` holds **18 sanctioned entries and 18 `auditEvent: null`**.
Measured, not recalled: every `auditEvent` field in the file is the literal `null`. The first three
clauses are satisfied by all 18; the fourth is satisfied by none. Two of the entries already say so
in their own prose — the `view` and `download` entries each close with "The at-mint AUDIT EVENT is
still owed".

The concrete consequence, stated without softening: **today a counsellor can upload, open and
download a student's passport scan and nothing anywhere records that it happened.** Stage 4's exit
gate is "an unauthorized actor cannot upload, view, download, review, or enumerate a document, and
the authorized request-to-approval flow works." MV-182/185/186/190 built the flow. §8 is the
evidence half, and it is the Stage 4 bullet "add document access audit events" (plan line 652).

### 8.0 What was measured, and what could not be

**The Supabase MCP was NOT reachable in this session** (it requires an interactive OAuth flow;
this session is non-interactive). Every database claim below was therefore re-measured against the
**local Docker stack**, which replays the same migration series that produced production. That is
strong evidence for anything determined by the migrations, and *no* evidence for production's
runtime data. The distinction is kept explicit rather than blurred:

| # | Claim carried into this slice | Verdict | How |
|---|---|---|---|
| 1 | `public.audit_events` exists; columns `id, organization_id, case_id, actor_user_id, action, entity_type, entity_id, metadata jsonb, created_at`; four indexes | **CONFIRMED** | `information_schema.columns` — exact column list and types match; `20260730120000_stage1_tenancy_core.sql:182-196` |
| 2 | Row count is 0 | **CONFIRMED locally** (0 rows). Production row count **NOT verifiable** this session | `select count(*)` on the local stack only |
| 3 | `service_role` holds INSERT/SELECT/UPDATE/DELETE/TRUNCATE directly, and `rolbypassrls = true` | **CONFIRMED** | `role_table_grants` returns `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`; `pg_roles.rolbypassrls = true` |
| 4 | `private.write_audit_event` is inert; ACL is `postgres=X/postgres` | **CONFIRMED** | `pg_proc.proacl` reads exactly `postgres=X/postgres` — neither `service_role` nor `authenticated` holds EXECUTE |
| 5 | Append-only survives `service_role` — the BEFORE UPDATE trigger raises for every role | **CONFIRMED** | `set role service_role;` then UPDATE → `audit_events is append-only (no UPDATE permitted)` |
| 6 | `audit_events_select_admin` is live, `USING (organization_id = ANY(private.actor_admin_org_ids()))` | **CONFIRMED** | `pg_policies` — one policy, `cmd = SELECT`, qual matches |
| 7 | All 10 production cases have `organization_id = NULL` | **NOT VERIFIABLE** this session — carried forward as an assumption | — |

Claims 2 and 7 are the two the slice must not *depend* on. It does not: §8.5 explains why the code
is correct whether an organization exists or not, and the fixture in §8.5 builds a real one rather
than trusting the null-org state.

The probe grant used to test D11 was **reverted** (`proacl` re-read as `postgres=X/postgres`) and
the probe rows deleted (`count(*)` back to 0). The local stack is in the state it started in.

### 8.1 Decision D11 — the write is a direct INSERT on the service-role client. NO MIGRATION.

The alternative had to be killed properly rather than waved away, because "grant EXECUTE on the
function that already exists" is the obvious move and the function's own header invites it.

**It does not work, and the reason is structural, not a permission.** Measured, in both directions:

1. With EXECUTE revoked (today's state), `POST /rest/v1/rpc/write_audit_event` as `service_role`
   returns **404 `PGRST202`** — *"Searched for the function **`public`.write_audit_event`** … no
   matches were found in the schema cache."* PostgREST looked in `public`. It never considered
   `private`.
2. EXECUTE was then granted to **both** `service_role` and `authenticated`, and the schema cache
   reloaded. The same call still returns **404 `PGRST202`**, identically.
3. Forcing the schema explicitly with `Content-Profile: private` returns **406 `PGRST106`** —
   *"Invalid schema: private. Only the following schemas are exposed: public, graphql_public."*
4. `audit_events` rows written by attempts 1–3: **zero**.

So the grant is not the blocker; **exposure** is, and `supabase/config.toml` sets
`schemas = ["public", "graphql_public"]`. Reaching the function from supabase-js would mean either:

- **exposing `private`** — which holds `actor_admin_org_ids`, `can_staff_case`,
  `enforce_case_write_surface` and every other RLS helper. Exposing that schema hands every client
  a direct callable into the authorization layer to satisfy a logging concern. Not a trade, a
  regression; or
- **adding a `public` wrapper** — a new function, a new grant, a new migration, and a second name
  for one behaviour, all so a client that *already holds INSERT on the table* can take a longer
  road to the same row.

Both are worse than the direct insert. And the direct insert is not a workaround invented here —
`20260730180000_case_aware_rls_policies.sql:750-753` already wrote the conclusion down:
*"Audit rows are written by server paths running as service_role or by the definer's owner."*
D11 executes that reviewed intent; it does not overturn it.

**Therefore: this slice ships NO MIGRATION, and therefore no gated production apply — which is
what makes it one PR, exactly like MV-186.** `private.write_audit_event` stays inert, and that is
now a recorded decision rather than an open TODO: it is unreachable from the Data API by design,
and Stage 6 may either expose a `public` wrapper for it or drop it.

The write goes through **one module**, `lib/audit/write-audit-event.ts`, not five inline inserts —
the plan's "single server choke point" (line 504), and the thing that makes D13's sweep possible.

### 8.2 Decision D12 — fail-closed. No 2xx is ever returned without its audit row committed.

This is the genuine fork, and it is decided here rather than left to fall out of whichever `await`
got typed first.

The two positions are real. *"Log loudly and still serve"* keeps document access alive through an
audit outage, at the cost of silent gaps in the evidence log — gaps that are indistinguishable,
later, from "no one accessed it". *"No audit, no access"* is the stronger security posture and the
one an append-only evidence log implies.

**The plan settles it, in a sentence written before this slice existed** (line 504):

> Sensitive reads, including document views and downloads, exports, and audit queries themselves,
> are recorded at the same choke point that authorizes them, **which guarantees that an authorized
> sensitive read and its audit row cannot be separated.**

"Cannot be separated" is not "should usually accompany". **Decision: fail-closed.** If the audit
write fails, the request fails.

But fail-closed only *buys* something if the audit row lands before the effect it records becomes
irreversible, and that differs between the read paths and the write paths. The placement is
therefore part of the decision, not an implementation detail:

- **Signed-URL mints (`documents/[id]/view`, `document-versions/[versionId]/download`) — audit
  BEFORE the mint.** A signed URL is an unauthenticated bearer of the bytes the instant it exists.
  Mint-then-audit would mean that on an audit failure the URL already exists and the bytes are
  already reachable — the guarantee lost in exactly the case it was written for. So: write the
  audit row, then mint. Audit fails → 500, and `createSignedUrl` is never reached. **Here the
  strong guarantee holds completely: no unaudited URL is ever minted.**
- **Mutations (`documents/upload`, `documents/[id]` DELETE, `…/versions` POST) — audit AFTER the
  effect commits.** The inverse is not available: auditing before the upload would record
  `document.uploaded` for an upload that may still fail, which is a lie in an evidence log, and
  the vocabulary is past-tense noun-first for a reason. Audit fails → 500.

Stating honestly what that second bullet does and does not buy: the object is already in Storage
and the row already written when the audit is attempted, and this slice does **not** add a
rollback for that (the version route's existing compensating delete covers a failed *row* write,
not a failed *audit* write; extending it is Stage 6's retention/tombstone work, not this card's).

So the invariant that actually holds across all five routes — the one that is testable, and the one
the tests are named for — is:

> **No route returns a 2xx response without its audit row committed.**

A caller who receives 200 has an audit row. A caller who receives 500 may or may not have caused an
effect, but is never told the operation succeeded. That is the honest statement of the guarantee,
and it is strictly stronger on the read paths, where the effect never happens at all.

**Named test per path, both directions** (§8.7) — a failure-path test that asserts the 500 *and*
asserts `createSignedUrl` was never called is the one that distinguishes D12 from a `.catch(() => {})`.

### 8.3 Decision D13 — metadata is a CLOSED allow-list, swept from source. `original_name` is the trap.

The plan's constraint (line 275): *"Sensitive document content, passport numbers, and raw student
details must not be copied into audit metadata."*

The specific hazard, named: `case_document_versions.original_name` and `documents.original_name`
are **user-supplied filenames**, and in this corridor they are routinely
`Ram_Bahadur_passport_2026.pdf`. A filename is raw student detail. It must not reach `metadata` and
must not reach `entity_id`.

Measured, the free-text columns on the four document tables are exactly:

| Table | Free-text columns |
|---|---|
| `documents` | `original_name`, `file_path`, `kind` |
| `case_document_versions` | `original_name`, `storage_path`, `content_type` |
| `case_document_requests` | `title`, `note`, `kind`, `status` |
| `case_document_reviews` | `note`, `decision` |

`file_path` / `storage_path` are structurally safe — `storageName` is
`` `${crypto.randomUUID()}.${extensionFor(file.type)}` `` (upload route line 129), so no path
carries user text — but they are fenced from metadata anyway, because `entity_id` already carries
the identity and a path in an evidence log invites a future author to put a *derived* name in one.

**The closed allow-list of metadata keys** — anything not on this list is a test failure:

`kind`, `mime_type`, `byte_size`, `case_keyed`, `version_id`, `document_id`, `request_id`, `reason`

All are uuids, enum-ish tokens, booleans, or integers. `entity_id` carries a **uuid only**.

**The enforcement is a source sweep, not a convention**: a test reads the audit call sites and
fails on any of the banned field names (`original_name`, `originalName`, `safeOriginalName`,
`file.name`, `note`, `title`, `file_path`, `storage_path`, `filePath`, `storagePath`) appearing in
a metadata argument. The sweep splits on `/\r?\n/` — this is a CRLF tree and `split("\n")` matches
zero lines, which would make the assertion vacuously green (MISTAKES.md, Testing).

### 8.4 Decision D14 — `actor_user_id` is the authenticated human, never the service role.

The whole point of the log is *who reached the bytes*. Every one of the five routes has already
resolved `userData.user.id` from the **authenticated** client before it touches service-role — the
audit writer takes that id as a required argument and has no default. The service-role client is
the *transport* for the insert; it is never the subject of the row.

A named test asserts `actor_user_id` equals the signed-in user's id and not any service identity.

### 8.5 Decision D15 — `organization_id` is populated from the case, via `CaseContext`. Widening `TargetCase` is the change.

`audit_events_select_admin` reads
`USING (organization_id = ANY (private.actor_admin_org_ids()))`. In SQL, `NULL = ANY(…)` is `NULL`,
not `true` — so **a row written with a null `organization_id` matches no admin and is readable by
nobody, ever.** An audit log that is structurally unreadable is a write-only log.

Today that is the *correct* outcome for a self-serve student: their case has no organization, and
there is no org admin who should be reading their access history. The requirement is not "invent an
org" — it is that **the row must carry whatever the case's organization actually is**, so the log
becomes readable the moment a consultancy exists, without a backfill.

**The finding that makes this cheap.** `checkCasePermission` already returns
`{ decision, context }`, and `CaseContext.organizationId` is documented as *"The case's
organization, or null for a personal case"* (`lib/cases/context.ts:52-53`) — resolved from
`cases.select("id, organization_id, student_user_id")` inside `getCaseContext`. The two routes that
call `checkCasePermission` directly (the two MV-186 routes) **already have it in hand**.

The three MV-190 routes call `resolveTargetCase`, which calls `checkCasePermission` internally
(`lib/cases/target-case.ts:89`) — and then **throws the context away**, returning
`{ ok: true, caseId }`. So the fix is not a new query and not a new round trip: widen the success
variant to

```ts
| { ok: true; caseId: string; organizationId: string | null }
```

and return the `organizationId` the function already computed. That is the one type change in this
slice, and it is additive — every existing destructure of `{ caseId }` keeps compiling.

**The fixture trap, named before it bites.** An integration test asserting *"an org admin can read
the audit row"* passes **vacuously** against a null-org fixture: the row is unreadable, the admin
reads nothing, and "no rows" is what a *correct* denial also looks like. This is the third
appearance of the same shape (MV-190's all-digit uuid, MV-186's 10-byte PDF; MISTAKES.md, Testing).
So the integration test **builds a real organization, a real admin membership, and an org-owned
case**, and it **asserts the fixture can express the thing before asserting the thing** — an
org-scoped row IS readable by its admin, and a *different* org's admin reads zero. Without that
first assertion the second proves nothing.

### 8.6 Observation, recorded not fixed — `service_role` holds TRUNCATE on the evidence table

Measured: `has_table_privilege('service_role','public.audit_events','TRUNCATE')` → **true**
(DELETE → true as well).

The Stage 1 comment (`20260730120000:203-204`) leaves DELETE open **deliberately**, for the Stage 6
retention / tombstone path, and names the `program_predictions` precedent. That reasoning covers
DELETE. It does not mention TRUNCATE, and TRUNCATE differs in kind from the case it argues for:

- it is not row-scoped, so it cannot express a retention predicate — the only justification offered;
- it **does not fire the `BEFORE UPDATE` trigger** and is not row-by-row, so the append-only guard
  that defeats `bypassrls` for UPDATE is simply not in the path;
- it is held by the **same key every server route already uses**, so any injection or bug on a
  service-role path can erase the entire evidence log in one statement, atomically.

**Recommendation, not a change:** `revoke truncate on public.audit_events from service_role` in the
Stage 6 retention migration, where DELETE's retention predicate is designed anyway. It is *not*
done here because this slice ships no migration (D11) and because revoking a privilege on a live
table is a production apply that deserves its own gate — the exact scope creep the card forbids.
Recorded here so it is a decision with a home, not a thing nobody wrote down.

### 8.7 What MV-189 ships

1. **`lib/audit/write-audit-event.ts`** — the single choke point (D11). Takes an explicit
   `actorUserId` (D14), an `organizationId` (D15), a `caseId`, an `action` from a closed union, an
   `entityType`/`entityId` (uuid only), and metadata restricted to the D13 allow-list. Inserts
   directly on the service-role client. **Throws on failure** (D12) — it does not swallow, and it
   does not return a boolean nobody checks.
2. **Five routes wired**, each at the position D12 assigns it:
   - `app/api/documents/upload/route.ts` → `document.uploaded` (after commit)
   - `app/api/documents/[id]/view/route.ts` → `document.viewed` (**before** the mint)
   - `app/api/documents/[id]/route.ts` → `document.deleted` (after commit)
   - `app/api/cases/[caseId]/document-requests/[requestId]/versions/route.ts` →
     `document.version_uploaded` (after commit)
   - `app/api/cases/[caseId]/document-versions/[versionId]/download/route.ts` →
     `document.downloaded` (**before** the mint)
3. **`TargetCase` widened** to carry `organizationId` (D15) — additive, one type, no new query.
4. **The five `auditEvent: null` fields set** on their entries in
   `lib/supabase/service-role-exceptions.ts`, and the file's "AUDIT WIRING IS NOT YET POSSIBLE"
   header corrected — it is now false, and D11 records why.
5. **Tests**: the D13 source sweep, the D12 fail-closed pair per route, the D14 actor assertion, and
   an integration test that builds a real org and proves the D15 row is readable by its admin and by
   no other admin.

The vocabulary follows the four names already declared in `SANCTIONED_SERVICE_ROLE_CATEGORIES` —
dotted, past-tense, noun-first. `document.viewed` is reused verbatim from that list; the other four
are its siblings, not a new scheme.

### What §8 does NOT do

- **No migration** (D11) — every grant and policy it writes within is already applied. If this
  slice appears to need schema, that is a finding to report, not a migration to write.
- **The other 13 exception entries stay `null`.** Their paths are not document access; wiring them
  is Stage 6's "finish append-only security audit coverage" (plan line 668). A `null` on those
  entries still means what the file says it means.
- **No case-activity feed.** The plan keeps "case activity" and "security audit" **related but
  distinct** (line 497-500). This is the security audit. A collaborator-visible activity history is
  a different surface with a different audience and a different policy.
- **No audit READ surface and no UI** — Stage 6. `audit_events_select_admin` already exists; nothing
  in this slice queries it outside a test.
- **No scanning, quarantine, or backup** — the other Stage 4 bullet (line 653).
- **No MV-187 invitations, no MV-188 visa read.** `invitation.accepted`, `case.student_linked` and
  `retention.purged` stay unwired.
- **No TRUNCATE revoke** — §8.6, recommended and deliberately out of scope.
