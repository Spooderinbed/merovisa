# Case document collaboration — the 5B spec pass

**Date:** 2026-08-20 · **Lane:** consultancy workspace UI ·
**Plan:** `docs/superpowers/plans/2026-08-19-consultancy-workspace-ui-build.md` §3, PR 5B
**Status:** spec complete; 5B carved as **MV-185** (schema) then **MV-190** (Storage + routes).

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
