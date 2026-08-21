import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOwnCaseObjectPath, isCaseScopedObjectPath } from "@/lib/documents/case-object-path";
import type { CaseAuthorizationClient } from "./context";
import type {
  CaseDocumentReviewRow,
  CaseDocumentVersionRow,
} from "./document-collaboration";
import type { CaseWriteFailure } from "./write-repo";

/**
 * MV-186 — the document COLLABORATION data layer (Stage 4 slice 4).
 *
 * A file ARRIVES against a request (`case_document_versions`) and is then ACCEPTED
 * or REJECTED (`case_document_reviews`). MV-182 shipped the chase list, MV-185 the
 * schema, MV-190 the Storage path; this module is every read and write against the
 * two tables, and `lib/cases/document-collaboration.ts` is what their rows MEAN.
 *
 * THE AUTHENTICATED CLIENT, ALWAYS — the contract `./document-requests-repo.ts`,
 * `./write-repo.ts` and `./queue-repo.ts` all state. RLS evaluated as the signed-in
 * user is the tenant boundary; this module is data access behind an already-
 * authorized decision. It never imports `createSupabaseAdminClient`, and
 * `tests/supabase/service-role-exceptions.test.ts` asserts that `lib/cases/` reaches
 * for service-role nowhere. The BYTES are a different matter — those go through the
 * admin client in the route, because the bucket's only INSERT policy is
 * `service_role`-scoped — and that is precisely why the row is written here instead.
 *
 * ## Three rules every function below obeys
 *
 * 1. **A `42501` RESOLVES rather than rejects.** `grep -rn throwOnError lib/ app/`
 *    returns zero hits, so a call site that does not destructure `error` drops the
 *    write and reports success. Every write below destructures.
 * 2. **A read that FAILED is never an empty list.** An empty version history and a
 *    failed one render as "nothing has arrived" and "we could not find out", and
 *    telling a counsellor the first when the second is true is how a file that is
 *    already in front of them gets chased.
 * 3. **NO UPSERT, anywhere.** supabase-js compiles `.upsert()` to `INSERT … ON
 *    CONFLICT DO UPDATE SET` naming every payload column, so a column-scoped INSERT
 *    grant fails with `42501` at PLAN time even when the row does not exist.
 *    `tests/cases/document-collaboration-fence.test.ts` scans `lib/` and `app/` for
 *    exactly this and has been waiting for these call sites since MV-185.
 *
 * ## And one rule about what this module does NOT write
 *
 * **`case_document_requests.status` is never written here.** The two `after insert`
 * triggers write it in the same statement, and `private.guard_document_request_status`
 * refuses a contradicting hand-written value with a `23514`. Spec §3: "derived, never
 * a second source of truth." A repository that also wrote it would be the second one.
 *
 * ## No UPDATE and no DELETE verb, on purpose
 *
 * MV-185 grants neither on either table and asserts both absences at apply time.
 * Both tables are append-only to a client: a rejected file is superseded by a new
 * upload, and a mistaken review is corrected by writing another one — the newest is
 * the judgement. A helper named `updateReview` could only ever raise `42501`, so
 * there is not one, and a named test pins the module's surface against acquiring one.
 */

/**
 * PostgREST's `max_rows` (supabase/config.toml). Nothing in the database bounds
 * versions per case, so a read this long MAY be a silent prefix — and a prefix here
 * is a version history missing its newest row, which would render the WRONG state
 * for a request. `./document-requests-repo.ts` states the same rule and applies it
 * the same way.
 */
export const COLLABORATION_ROW_CEILING = 1000;

export type CollaborationListFailure = "lookup-failed";

export type VersionListResult =
  | { ok: true; data: CaseDocumentVersionRow[] }
  | { ok: false; reason: CollaborationListFailure };

export type ReviewListResult =
  | { ok: true; data: CaseDocumentReviewRow[] }
  | { ok: false; reason: CollaborationListFailure };

export type VersionLookupResult =
  | { ok: true; data: CaseDocumentVersionRow | null }
  | { ok: false; reason: CollaborationListFailure };

export type CollaborationCreateFailure = CaseWriteFailure | "unknown-case" | "not-an-org-case";

export type VersionCreateResult =
  | { ok: true; id: string }
  | { ok: false; reason: CollaborationCreateFailure };

export type ReviewCreateResult =
  | { ok: true; id: string }
  | { ok: false; reason: CollaborationCreateFailure };

/**
 * What a caller must already have done before it calls `createCaseDocumentVersion`:
 * uploaded the bytes to `storagePath`, under an `id` it generated itself.
 *
 * The `id` is the caller's because the ORDER is load-bearing (spec §6.2, D5): with a
 * server-issued id the sequence must be insert → upload, and a failed upload strands
 * a row pointing at bytes that do not exist — with no DELETE grant to retract it, so
 * the request stays `outstanding` behind a file nobody can open. A client-chosen id
 * inverts it to upload → insert, where a failed upload writes no row at all and a
 * failed insert leaves an orphaned object nothing references.
 */
export interface VersionInput {
  id: string;
  requestId: string;
  storagePath: string;
  fileSize: number;
  originalName: string;
  contentType: string | null;
}

export interface ReviewInput {
  decision: string;
  note: string | null;
}

/** The two values the check constraint admits. No `pending`: that is the ABSENCE of a row. */
export const REVIEW_DECISIONS = ["accepted", "rejected"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

function isPresent(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** A PostgREST code, mapped the way `./write-repo.ts:160` maps it. */
function writeFailure(code: string | undefined): CaseWriteFailure {
  return code === "42501" ? "denied" : "write-failed";
}

async function client(db?: CaseAuthorizationClient): Promise<CaseAuthorizationClient> {
  return db ?? (await createSupabaseServerClient());
}

const VERSION_COLUMNS =
  "id, request_id, storage_path, file_size, original_name, content_type, created_at";

/**
 * `uploaded_by` and `reviewed_by` are read by the database and NOT carried, for the
 * reason MV-170 gives about `student_user_id` and MV-182 about `requested_by`: a raw
 * Auth user id is no use to a counsellor and does not belong in markup. The columns
 * exist so the INSERT policies have something truthful to pin and so Stage 6's audit
 * has provenance to read — not so a list can print them.
 */
function toVersion(row: {
  id: string;
  request_id: string;
  storage_path: string;
  file_size: number;
  original_name: string;
  content_type: string | null;
  created_at: string;
}): CaseDocumentVersionRow {
  return {
    id: row.id,
    requestId: row.request_id,
    storagePath: row.storage_path,
    fileSize: row.file_size,
    originalName: row.original_name,
    contentType: row.content_type,
    createdAt: row.created_at,
  };
}

/**
 * Every version on one case, for the Documents page.
 *
 * ONE READ for the whole case rather than one per request: a case with twelve
 * requests would otherwise be twelve round trips, and
 * `case_document_versions_request_id_created_at_idx` covers the grouping the pure
 * module does in memory.
 */
export async function listCaseDocumentVersions(
  caseId: string,
  db?: CaseAuthorizationClient,
): Promise<VersionListResult> {
  if (!isPresent(caseId)) return { ok: false, reason: "lookup-failed" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("case_document_versions")
      .select(VERSION_COLUMNS)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) return { ok: false, reason: "lookup-failed" };
    const rows = data ?? [];
    // At the ceiling the answer MAY be a prefix, and PostgREST does not say so. A
    // truncated history is not a shorter history — it is a WRONG state for whichever
    // request lost its newest row.
    if (rows.length >= COLLABORATION_ROW_CEILING) return { ok: false, reason: "lookup-failed" };

    return { ok: true, data: rows.map(toVersion) };
  } catch {
    return { ok: false, reason: "lookup-failed" };
  }
}

/** Every review on one case. Same shape, same rules, same ceiling. */
export async function listCaseDocumentReviews(
  caseId: string,
  db?: CaseAuthorizationClient,
): Promise<ReviewListResult> {
  if (!isPresent(caseId)) return { ok: false, reason: "lookup-failed" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("case_document_reviews")
      .select("id, version_id, decision, note, created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) return { ok: false, reason: "lookup-failed" };
    const rows = data ?? [];
    if (rows.length >= COLLABORATION_ROW_CEILING) return { ok: false, reason: "lookup-failed" };

    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        versionId: row.version_id,
        decision: row.decision,
        // The NOTE travels. "Rejected" with no reason is a wall, and the linked
        // student reads this through `case_document_reviews_select_actor`.
        note: row.note,
        createdAt: row.created_at,
      })),
    };
  } catch {
    return { ok: false, reason: "lookup-failed" };
  }
}

/**
 * One version, resolved by id AND by case — the download route's read.
 *
 * BOTH filters, for the reason `resolveCaseDocumentRequest` gives: the caller
 * authorized ONE case, so without the `case_id` predicate a version id belonging to
 * a different case the actor happens to staff would resolve under this case's
 * authorization and hand its path to the mint. RLS would still hold the tenant
 * boundary — but "the tenant boundary held" is not "the row the user asked for is
 * the row they got".
 */
export async function getCaseDocumentVersion(
  versionId: string,
  caseId: string,
  db?: CaseAuthorizationClient,
): Promise<VersionLookupResult> {
  if (!isPresent(versionId) || !isPresent(caseId)) return { ok: false, reason: "lookup-failed" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("case_document_versions")
      .select(VERSION_COLUMNS)
      .eq("id", versionId)
      .eq("case_id", caseId)
      .maybeSingle();

    // An absent row and a FAILED lookup are different sentences to the user, and
    // only one of them says anything about the version existing.
    if (error) return { ok: false, reason: "lookup-failed" };
    return { ok: true, data: data ? toVersion(data) : null };
  } catch {
    return { ok: false, reason: "lookup-failed" };
  }
}

/**
 * Record that a file arrived against a request.
 *
 * Authorization is the CALLER's — `checkCasePermission(actor, caseId,
 * "case.documents.request")`. This function does not re-decide it;
 * `case_document_versions_insert_staff` and its five conjuncts are the layer that
 * cannot be talked out of it.
 *
 * ## Why the organization is READ rather than accepted
 *
 * The same reasoning `createCaseDocumentRequest` states: the INSERT policy pins
 * `organization_id = private.case_org_id(case_id)`, so a caller-supplied value could
 * only agree or be refused. Resolving it here makes the column right by construction
 * instead of turning a caller's bug into a `42501` the user reads as "you may not do
 * this" — and it names the two genuinely different refusals, a case that does not
 * exist and a PERSONAL case, which has no organization and can carry no consultancy
 * version at all.
 */
export async function createCaseDocumentVersion(
  actorUserId: string,
  caseId: string,
  input: VersionInput,
  db?: CaseAuthorizationClient,
): Promise<VersionCreateResult> {
  // A blank identifier can only come from a bug or a probe; neither earns a query.
  if (!isPresent(actorUserId) || !isPresent(caseId)) return { ok: false, reason: "invalid-input" };
  if (!isPresent(input.id) || !isPresent(input.requestId)) {
    return { ok: false, reason: "invalid-input" };
  }
  if (!isPresent(input.storagePath) || !isPresent(input.originalName)) {
    return { ok: false, reason: "invalid-input" };
  }
  if (!Number.isInteger(input.fileSize) || input.fileSize < 0) {
    return { ok: false, reason: "invalid-input" };
  }

  // THE PATH BOUND, checked before the write rather than only at the database.
  //
  // `case_document_versions_storage_path_case_prefix` is the floor and would raise a
  // `23514`; refusing here means the caller learns it passed a bad argument instead
  // of reading a constraint violation as a permission answer. Neither layer subsumes
  // the other — the CHECK binds `service_role` too, and this one names the mistake.
  //
  // Both predicates, because they say different things: `isOwnCaseObjectPath` admits
  // an owner-keyed vault path (it cannot carry a case in its name, so it must not
  // pretend to re-check one), and a version's path is case-keyed or it is nothing.
  if (!isCaseScopedObjectPath(input.storagePath)) return { ok: false, reason: "invalid-input" };
  if (!isOwnCaseObjectPath(caseId, input.storagePath)) return { ok: false, reason: "invalid-input" };

  try {
    const supabase = await client(db);

    const caseRow = await supabase
      .from("cases")
      .select("organization_id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseRow.error) return { ok: false, reason: "write-failed" };
    if (!caseRow.data) return { ok: false, reason: "unknown-case" };
    const organizationId = caseRow.data.organization_id;
    if (organizationId === null) return { ok: false, reason: "not-an-org-case" };

    const { data, error } = await supabase
      .from("case_document_versions")
      .insert({
        // THE CLIENT'S OWN id, so this one statement writes an `id` and a
        // `storage_path` that agree — and so the bytes could be uploaded first.
        id: input.id,
        case_id: caseId,
        organization_id: organizationId,
        request_id: input.requestId,
        // NULL, always, in this slice. Spec §7.5 (D10): `documents` is
        // UNIQUE (case_id, kind), so pointing a version at the vault would silently
        // REPLACE the student's current file for that kind — and version history
        // exists precisely so a file can arrive without overwriting anything.
        document_id: null,
        storage_path: input.storagePath,
        file_size: input.fileSize,
        original_name: input.originalName,
        content_type: input.contentType,
        // Provenance, pinned to the actor by the policy's fifth conjunct. Writing
        // anything else here is a write the database refuses.
        uploaded_by: actorUserId,
      })
      .select("id")
      .single();

    if (error) return { ok: false, reason: writeFailure(error.code) };
    if (!data) return { ok: false, reason: "write-failed" };
    return { ok: true, id: data.id };
  } catch {
    // A thrown client, an aborted request, or a client that does not expose `from`.
    // A write that could not complete is a failure, never a success.
    return { ok: false, reason: "write-failed" };
  }
}

/**
 * Judge one version.
 *
 * `version_id` is bounded to this case by the INSERT policy's third conjunct
 * (`private.document_version_case_id(version_id) = case_id`), so a review cannot
 * land on another case's version and resolve another case's request. The caller
 * still resolves the version through `getCaseDocumentVersion` first, because a
 * policy refusal arrives as `42501` — which the user reads as "you may not do this"
 * — and "no such version on this case" deserves its own answer.
 */
export async function createCaseDocumentReview(
  actorUserId: string,
  caseId: string,
  versionId: string,
  input: ReviewInput,
  db?: CaseAuthorizationClient,
): Promise<ReviewCreateResult> {
  if (!isPresent(actorUserId) || !isPresent(caseId) || !isPresent(versionId)) {
    return { ok: false, reason: "invalid-input" };
  }

  // The guard between user input and the check constraint: a value the constraint
  // cannot admit is refused here rather than sent as a write that can only `23514`.
  const decision = (input.decision ?? "").trim();
  if (!(REVIEW_DECISIONS as readonly string[]).includes(decision)) {
    return { ok: false, reason: "invalid-input" };
  }

  // Blank is stored as NULL, never as "". `note` is nullable and "no reason given"
  // is a real state; an empty string would be a third value that renders as a reason
  // the reviewer did not write.
  const note = (input.note ?? "").trim();

  try {
    const supabase = await client(db);

    const caseRow = await supabase
      .from("cases")
      .select("organization_id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseRow.error) return { ok: false, reason: "write-failed" };
    if (!caseRow.data) return { ok: false, reason: "unknown-case" };
    const organizationId = caseRow.data.organization_id;
    if (organizationId === null) return { ok: false, reason: "not-an-org-case" };

    const { data, error } = await supabase
      .from("case_document_reviews")
      .insert({
        case_id: caseId,
        organization_id: organizationId,
        version_id: versionId,
        decision,
        note: note === "" ? null : note,
        reviewed_by: actorUserId,
      })
      .select("id")
      .single();

    if (error) return { ok: false, reason: writeFailure(error.code) };
    if (!data) return { ok: false, reason: "write-failed" };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}
