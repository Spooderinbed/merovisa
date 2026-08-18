# MV-182 — Case document requests: the chase list (Stage 4 slice 1)

**Priority:** P1 · **Owner:** agent · **Created:** 2026-08-18

## Why

Stage 4 is "documents per case". Its first honest unit of value is not storage and not a viewer — it is **the chase list**: a counsellor asks a case for a specific document, sees what is still outstanding, and sees it resolve. Everything else in Stage 4 (records, versions, reviews, Storage policies, signed downloads, scanning) sits on top of that and is out of scope here.

The existing vault cannot carry it. `documents` and `document_status` each hold `UNIQUE (case_id, kind)`, so the current model is **strictly one document per kind per case** — there is nowhere to record "we asked for this on the 3rd, it is still outstanding" alongside "here is the file", and no way to ask for the same kind twice after a rejection. The roadmap (`docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`, "Absorb into the consultancy work") is explicit that document-status work must become part of the request/version/review model **rather than extending the current single-owner design**. So this slice adds a new table beside the vault and touches neither.

**Spec:** `docs/superpowers/specs/2026-08-07-stage3-workspace-and-access-matrix.md` §5 (Stage 3 non-goals — everything document-shaped is Stage 4) + §6.1 rows 7 and 8 (`documents` INSERT deferred to Stage 4; `documents` UPDATE **never**, "Stage 4 replaces the model").

## Scope

1. **Migration** (authored, **not** applied) — `public.case_document_requests`, RLS on from the first line, column-scoped grants in the MV-161 / MV-168 idiom, apply-time assertions in the MV-159 §13 idiom.
2. **Permission** — a new case-scoped verb `case.documents.request` in `CASE_PERMISSIONS` + `CASE_SCOPED_PERMISSIONS`, with an honest cell for all four roles. Reading requests rides existing `case.read`.
3. **Repository** — `lib/cases/document-requests-repo.ts`, case-scoped, authenticated client only.
4. **Surface** — a `documents` section on the case route listing outstanding and resolved requests, with create and resolve.

## The fence (what this slice deliberately does NOT touch)

- No change to `documents` or `document_status` — not the tables, not the routes (`app/api/documents/[id]/route.ts`, `.../view/route.ts`, `.../upload/route.ts` keep their service-role classification and their "wait for Stage 4" note).
- No `storage.objects` policies, no bucket work, no signed downloads, no upload-path change, no scanning/quarantine.
- No document versions, no reviews, no case-activity feed.
- `components/workspace/case-decision-strip.tsx` is **not claimed** — it returns `null` on purpose and belongs to the judgement slice.
- Nothing from MV-179 / MV-180 / MV-181 is rebuilt.

## Acceptance criteria

1. A counsellor assigned to a case can create a request for a document kind, and it appears as outstanding.
2. Outstanding and resolved requests render as two distinct groups; resolving one moves it.
3. A counsellor **not** assigned to the case, and any actor from another organization, can neither read nor create requests on it — proven at the database, not only in the app layer.
4. The linked student may READ their own case's requests and may NOT create one. (The student-facing surface itself is Stage 5 and is not built here.)
5. `resolved_at` and `organization_id` cannot be forged by a client: the first is stamped by a trigger, the second is pinned to the case's real organization by the INSERT policy.
6. Gate green (`typecheck` / `lint` / `test`), a cross-tenant assertion in the `integration` job, and a live browser pass at 1280×720 and 375×812 in both themes.

## Test plan

- **Unit** — the permission matrix gains a row and every existing cell assertion stays green; repository tests over `fakeCaseDb` for create / list / resolve, including the failure taxonomy (`invalid-input` / `denied` / `write-failed` / `lookup-failed`) and the "a policy refusal is zero rows, not an error" read-back rule.
- **Route** — the documents page renders for a permitted viewer, hides the create control from a viewer without `case.documents.request`, and stays inside the persistent frame.
- **Integration** (`tests/integration/stage4-document-requests.itest.ts`, gating CI job) — cross-tenant and unassigned-counsellor denial, student read-yes/create-no, the forged-`organization_id` and forged-`requested_by` refusals, and the absence of a DELETE grant.
- **Mutation testing** — break each RLS predicate, remove the permission check, and swap the case scoping; a named test must fail for each.

---

## Evidence (2026-08-18, branch `mv-182-case-document-requests`)

**Gate:** `npm test` 3465 passed / 369 files · `npm run typecheck` clean · `npm run lint` clean.

**No database evidence is claimed from this machine.** There is no local Supabase stack here and the Docker daemon is not running (`docker ps` → `failed to connect to the docker API`), so the migration was neither applied nor exercised locally. The DB half of this slice is proven by CI's gating `integration` job, which self-hosts its own stack, applies the migration, and runs `tests/integration/stage4-document-requests.itest.ts`.

**The migration is authored, NOT applied to production.** Applying it is a separate founder-gated step.

### What shipped

| Concern | Where |
|---|---|
| `case_document_requests` table, RLS forced, 3 policies, column-scoped grants, 2 triggers, 10 apply-time assertions | `supabase/migrations/20260818120000_stage4_case_document_requests.sql` (new) |
| `case.documents.request` claim + matrix row for all four roles | `lib/cases/permissions.ts` |
| Case-scoped repository (list / create / resolve) | `lib/cases/document-requests-repo.ts` (new) |
| Create + resolve API | `app/api/cases/[caseId]/document-requests/{route.ts,[requestId]/route.ts}` (new) |
| Documents section on the case route | `app/(app)/workspace/[organizationId]/students/[caseId]/documents/page.tsx` (new) |
| The chase list itself (the one client boundary) | `components/workspace/case-document-requests.tsx` (new) |
| Nav entry — the route ships, so the link ships | `.../students/[caseId]/layout.tsx` |
| Generated DB types, hand-extended for the new table | `lib/supabase/types.ts` |
| New table in the shared fake DB | `tests/helpers/fake-case-db.ts` |

### Design decisions taken, with their reasons

1. **No `UNIQUE (case_id, kind)`.** The vault's one-row-per-kind shape is exactly what the roadmap says must not be extended. A case must be able to carry two `bank-statement` requests ("father's" and "applicant's") and to re-ask after a rejection.
2. **Two statuses, not three.** `outstanding` / `resolved` only — no `cancelled`, because this slice ships no cancel control and an enum value with no caller is a promise the UI does not keep. **Consequence, stated rather than hidden:** a request created in error is closed by resolving it. Cancellation belongs to the follow-up that builds versions and reviews.
3. **No DELETE grant.** A request is the record that a document was chased; deleting the row deletes that record. Same reading as `plan_items` DELETE (spec §6.1 row 6).
4. **`resolved_at` is trigger-stamped and client-ungrantable**, so a client cannot date its own resolution. Re-resolving does not re-stamp; re-opening clears.
5. **The write controls are gated on `isStaffOnCase(grantedRoles)`,** which is what `private.can_staff_case` decides on and exactly the shape of the matrix row. A second permission round trip would buy a second failure mode, not a second lock — the reading `lib/cases/case-route.ts` already states for `case.assign`.
6. **`requested_by` is stored and NOT rendered.** A raw Auth user id is no use to a counsellor and does not belong in markup (MV-170's rule); the column exists so the policy has something truthful to pin and Stage 6's audit has provenance to read.

### Mutation testing — 23 applied, 23 caught

Measured: each mutation was applied to the real source, the named suites were run, and the file was restored. A mutation that left the suite green would be a hole, not a pass.

| # | Mutation | Named test that failed |
|---|---|---|
| M1 | matrix: counsellor `case.documents.request` `assigned` → `all-org` | `counsellor × case.documents.request requires scope "assigned"` |
| M2 | matrix: student cell `deny` → `linked` (student may ask) | `a student may not REQUEST a document, but the read that shows them one still allows` |
| M3 | drop the claim from `CASE_SCOPED_PERMISSIONS` | `the two sets partition the 14 claims, with no overlap and nothing dropped` |
| M4 | list: drop the `case_id` filter | `reads only the requests of the case it was handed` |
| M5 | list: failed read → empty list instead of outage | `a read that FAILED is lookup-failed, never an empty chase list` |
| M6 | list: drop the PostgREST row-ceiling guard | `a read at PostgREST's row ceiling is an outage, because it MAY be a prefix` |
| M7 | create: allow a personal case | `a personal case has no organization, so it can carry no request` |
| M8 | create: drop the document-kind validation | `a kind outside the document vocabulary is refused before it reaches the check constraint` |
| M9 | create: attribute the request to another user | `writes the row against the case's OWN organization, and names the actor` |
| **M10** | **resolve: drop the case scoping** | `FILTERS ON THE CASE AS WELL AS THE ID — a request from another case is not resolvable here` |
| M11 | resolve: treat zero affected rows as success | `zero rows is a denial, not a success` |
| **M12** | **POST: gate on `case.read` instead of the write claim** | `gates on case.documents.request, not on case.read` |
| M13 | POST: authorize AFTER writing | `authorizes BEFORE it writes — a denial never reaches the repository` **and** `answers 403 on a denial and issues ZERO queries` |
| M14 | PATCH: gate on `case.read` | `gates on case.documents.request for the case in the PATH` |
| M15 | PATCH: stop forwarding the case id | `SCOPES THE MUTATION TO THAT CASE — the request id alone never decides` |
| M16 | PATCH: skip the request-id format guard | `refuses a malformed case id OR request id before a client exists` |
| M17 | page: hand the controls to every viewer | `the linked student sees the list and no controls` |
| M18 | page: failed read renders as an empty list | `a failed read is an outage, NOT 'nothing outstanding'` |
| M19 | page: read a case id other than the URL's | `reads THIS case's requests on the AUTHENTICATED client` |
| M20 | component: show resolve to a viewer who may not request | `a viewer who may not request sees the list and no form` |
| M21 | component: send blank note/dueAt instead of null | `omits an empty note and an empty due date rather than sending blanks` |
| M22 | component: PATCH without scoping the URL to this case | `PATCHes the request under THIS case's path` |
| M23 | frame: drop the Documents nav entry | `links every shipped case surface, scoped to THIS case` |

**M3's first run did not apply** — the anchor used `\n` while the checked-out file is CRLF (`autocrlf=true`, no `.gitattributes`). Re-run with a `\r?\n` anchor and it was caught. This is the Windows CRLF trap the MISTAKES log records, and the harness reported it as `PATCH-DID-NOT-APPLY` rather than as a pass, which is the reason the run was trustworthy.

### RLS mutations — mapped, NOT measured here

These need a live Postgres and there is none on this machine, so the table below is the **mapping**, not a measurement. CI's `integration` job is the verification. Every denial in the itest is deliberately paired with a positive case, because **an RLS suite that only asserts denials passes identically against a MISSING policy** — a table with RLS forced and no policy denies everything.

| Mutation to the migration | Named itest that must fail |
|---|---|
| `_select_case`: drop the `actor_case_ids()` predicate (admit all) | `an UNASSIGNED counsellor in the same organization sees nothing` · `organization B sees nothing — the tenant boundary` |
| `_select_case`: drop the policy entirely | `the ASSIGNED counsellor sees their case's requests` · `the LINKED STUDENT may read what has been asked of them` (the positive half) |
| `_insert_staff`: `can_staff_case` → `can_access_case` / `actor_case_ids()` | `the LINKED STUDENT may NOT — their own link must not launder them into the counsellor's chair` |
| `_insert_staff`: drop `organization_id = case_org_id(case_id)` | `A FORGED organization_id is refused even for an actor who may staff the case` · `a PERSONAL case can carry no request` |
| `_insert_staff`: drop `requested_by = auth.uid()` | `A FORGED requested_by is refused — one counsellor cannot attribute a request to another` |
| `_update_staff`: drop the policy or widen the predicate | `an UNASSIGNED counsellor, the LINKED STUDENT and organization B may NOT resolve` |
| widen the UPDATE grant beyond `status` | `grants exactly the three verbs, at exactly the columns the migration names` · `nobody may hand-write resolved_at` · `nobody may re-point a request into another case or another tenant` |
| widen the INSERT grant to a table-level grant | `grants exactly the three verbs…` · `naming an ungranted column is refused at plan time, whoever asks` |
| add a DELETE grant | `no client may delete a request, however staffed they are` |
| drop the resolution-stamp trigger | `the ASSIGNED counsellor may, and the TRIGGER stamps resolved_at` · `re-resolving does not re-stamp, and re-opening clears the stamp` |
| drop `force row level security` | `has RLS enabled AND forced` |

The migration additionally carries **10 apply-time assertions** (MV-159 §13 idiom) that raise during `migrate` rather than at test time — including the schema-wide sweeps for `UPDATE (case_id)` and `UPDATE (organization_id)`, which are checked across every table because the rule is the schema's and not this file's.

### Live browser pass

jsdom has no layout engine, so a green suite cannot see wrapping, contrast or the mobile breakpoint. A temporary harness route rendered the real `CaseDocumentRequests` in five states (staff populated · staff nothing-asked · staff all-received · student read-only · outage card). **The harness was deleted before the commit** and no source residue remains.

| Viewport | Theme | Horizontal scroll | Overflowing elements | Lowest text contrast |
|---|---|---|---|---|
| 1280×720 | light | none (`scrollWidth` 1270 ≤ 1280) | 0 | **6.79:1** (caption on paper) |
| 1280×720 | dark | none | 0 | **6.90:1** (form label) |
| 375×812 | dark | none (`scrollWidth` 375) | 0 | ≥ 6.9:1 |
| 375×812 | light | none | 0 | **6.21:1** (caption on the resolved card's tint) |

- Dark mode resolves correctly: `data-theme="dark"`, body `rgb(20,16,20)` = `#141014`, card `#1e181d` — the `background-color` (not shorthand) rule holds.
- At 375 the request row stacks (`sm:flex-row`), the long note wraps to 2 lines inside its card, the date input holds its `max-w-[16rem]` (256px) and the select fits at 285px.
- Control counts confirm the permission split: 2 × "Mark received" and 3 × "Ask for this" across the three staff sections, **zero of either in the student section**.
- No console errors originate from the harness or the component; every error in the log names `MarketingLayout`/`HomePage` and is this worktree having no `.env.local`.

### Noted, not changed

The resolve button measures **40px tall** on mobile, under the 44px touch-target guideline. It uses `Button size="sm"`, the same size `case-manage-controls.tsx` uses throughout the workspace — so this is a property of the shared primitive, not of this slice. Changing `sizes.sm` would move every button in the app and belongs in its own card.

### Follow-up carved

Cancelling a request (the escape hatch for one created in error) and the request → version → review model it belongs to. Not built here; see decision 2 above.

---

## Post-review fixes (PR #148 review, 2026-08-18)

The first push failed the gating `integration` job three ways. All three are fixed on the branch; the
review that caught them is recorded here because two were invisible to a green local run.

**1 — the policy-verb test never executed.** `stage4-document-requests.itest.ts` built its expected
rows with `p.polname || '|' || p.polcmd`. `polcmd` is `"char"`, so `||` is ambiguous and psql
*errors* rather than the assertion *failing* — the suite reported a failed suite, not a failed test,
and the claim "all three policies are attached to the verb they claim" had never once been checked
on a brand-new access-control table. Fixed with `p.polcmd::text`, the cast `MV-159-rollback.sql:404`
already uses. Now proven: `insert_staff → a`, `select_actor → r`, `update_staff → w`.

**2 — the read policy was enrolled in a census it does not belong to.** It shipped as
`case_document_requests_select_case`. The `%_case` suffix is not a style convention: it is the census
key for MV-159's 24 policies on the **nine** student-owned tables, read by seven exact-count guards
(`MV-159/160/168-rollback.sql` ×6 and `supabase/rehearsal/README.md`), each asserting a total and
each phrased "on the nine" while querying `public` unscoped. The tenth table's policy pushed the
count to 25 and made the MV-168 rollback refuse — a rollback script failing on a misleading cause.

Founder call (2026-08-18): **rename the policy, leave the rehearsed rollback scripts untouched.**
Renamed to `case_document_requests_select_actor`, which also reads truer — it is `actor_case_ids()`,
staff plus the linked student. The migration carries a "do not rename this back" comment, and a new
test asserts *no* policy on this table ends in `_case` **and** that the census still reads 9 tables,
so the invariant is enforced rather than merely documented.

The alternative — scoping the seven guards to the nine — was measured as a provable no-op against
every state they were rehearsed on (all 27 `%_case` policies sit on the nine) and remains available
if a later slice would rather fix the guards than keep avoiding the suffix.

**3 — a structural inventory needed the new table named.** `case-backfill.itest.ts` asserts nothing
outside the nine carries `case_id` beyond `audit_events`/`case_assignments`/`invitations`. This table
legitimately does. Added **by name**, with a comment forbidding the lazy fix of relaxing it to
`toContain` — the guard's whole value is that it is exact.

### Evidence

Verified against the real local Postgres (Docker stack, migration applied by `docker cp` + `psql`):

| Check | Result |
|---|---|
| `stage4-document-requests.itest.ts` + `case-backfill.itest.ts` | **2 files, 59 tests passed** |
| Migration's own `DO` self-check block (incl. check 9, all three policies) | applied clean, no raise |
| `%_case` census after MV-182 | **27 policies on 9 tables** — unchanged from master |
| Policy → verb binding | `insert_staff|a`, `select_actor|r`, `update_staff|w` |

`stage2-data-equivalence.itest.ts` cannot run on this machine — it hits the known `.mjs`-shebang
import parse trap, a local-only defect unrelated to this change (it parsed fine in CI and failed
there on the count, which fix 2 removes). CI is the gate for that one.
