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

## Evidence

_Filled in on completion._
