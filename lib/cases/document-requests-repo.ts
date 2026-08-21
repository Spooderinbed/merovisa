import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/documents/types";
import type { CaseAuthorizationClient } from "./context";
import type { CaseWriteFailure } from "./write-repo";

/**
 * MV-182 — the document CHASE LIST's data layer (Stage 4 slice 1).
 *
 * A counsellor asks a case for a specific document, sees what is still outstanding,
 * and sees it resolve. `public.case_document_requests`
 * (`supabase/migrations/20260818120000_stage4_case_document_requests.sql`) is the
 * table; this module is every read and write against it.
 *
 * IT TOUCHES THE VAULT NOWHERE. `documents` and `document_status` each carry
 * `UNIQUE (case_id, kind)` — one document per kind per case — and the roadmap is
 * explicit that document-status work becomes part of the request/version/review
 * model rather than extending that single-owner design. So a request lives beside a
 * document, never on it, and nothing here reads or writes either table.
 *
 * THE AUTHENTICATED CLIENT, ALWAYS — the same contract as `./write-repo.ts` and
 * `./queue-repo.ts`. Row Level Security evaluated as the signed-in user is the
 * tenant boundary; this module is data access behind an already-authorized
 * decision. It never imports `createSupabaseAdminClient`, and
 * `tests/supabase/service-role-exceptions.test.ts` asserts that `lib/cases/`
 * reaches for service-role nowhere. The optional client parameter exists so tests
 * can inject a fake, never so a caller can substitute a wider one.
 *
 * ## The two PostgREST rules every function here obeys
 *
 * 1. **A `42501` RESOLVES rather than rejects.** `grep -rn throwOnError lib/ app/`
 *    returns zero hits, so a call site that does not destructure `error` drops the
 *    write and reports success. Every write below destructures.
 * 2. **A policy refusal is not an error** — Postgres reports it as zero rows
 *    affected. So the UPDATE reads its rows back and treats an empty result as
 *    `denied`; otherwise a refused resolve and a successful one are the same value.
 *
 * ## And one rule about the case id
 *
 * EVERY function takes the case explicitly and filters on it. None of them resolves
 * "the actor's own case" from anything — that is spec F-8's defect class, where a
 * case-scoped write authorized for one case lands on another because only a row id
 * decided which row moved. `resolveCaseDocumentRequest` filters on `case_id` as
 * well as `id` for exactly that reason, and a named test fails if the filter goes.
 *
 * ## No upsert, anywhere
 *
 * supabase-js compiles `.upsert()` to `INSERT … ON CONFLICT DO UPDATE SET` naming
 * every payload column, so a column-scoped INSERT grant fails with `42501` at plan
 * time even when the row does not exist. MV-168 converted three call sites for
 * exactly this reason; this one never had the chance to acquire it.
 */

/** The two states the check constraint admits. There is deliberately no `cancelled` — see the migration. */
export const DOCUMENT_REQUEST_STATUSES = ["outstanding", "resolved"] as const;
export type DocumentRequestStatus = (typeof DOCUMENT_REQUEST_STATUSES)[number];

/**
 * PostgREST's `max_rows` (supabase/config.toml). Staff hold a case-scoped INSERT
 * policy and nothing in the database bounds requests per case, so a read this long
 * MAY be a silent prefix — and a prefix here is a chase list that omits outstanding
 * items, which is worse than no list at all. `queue-repo.ts` states the same rule
 * for `plan_items` and applies it the same way.
 */
export const DOCUMENT_REQUEST_ROW_CEILING = 1000;

/**
 * One request, as the chase list renders it.
 *
 * `requested_by` is read by the database and NOT carried, for the reason MV-170
 * states about `student_user_id`: a raw Auth user id is no use to a counsellor and
 * does not belong in markup. The column exists so the INSERT policy has something
 * truthful to pin and so Stage 6's audit has provenance to read — not so this list
 * can print it.
 */
export interface CaseDocumentRequest {
  id: string;
  kind: string;
  title: string;
  note: string | null;
  status: string;
  dueAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type DocumentRequestListResult =
  | { ok: true; data: CaseDocumentRequest[] }
  | { ok: false; reason: "lookup-failed" };

export type DocumentRequestCreateFailure = CaseWriteFailure | "unknown-case" | "not-an-org-case";

export type DocumentRequestCreateResult =
  | { ok: true; id: string }
  | { ok: false; reason: DocumentRequestCreateFailure };

export type DocumentRequestResolveResult = { ok: true } | { ok: false; reason: CaseWriteFailure };

export interface DocumentRequestInput {
  kind: string;
  title: string;
  note?: string | null;
  dueAt?: string | null;
}

function isPresent(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}

/** A PostgREST code, mapped the same way `./write-repo.ts:160` maps it. */
function writeFailure(code: string | undefined): CaseWriteFailure {
  return code === "42501" ? "denied" : "write-failed";
}

async function client(db?: CaseAuthorizationClient): Promise<CaseAuthorizationClient> {
  return db ?? (await createSupabaseServerClient());
}

/**
 * One case's requests, soonest-due first.
 *
 * The ordering is the whole product point of a chase list: the question a counsellor
 * opens this section to answer is "what do I chase next", so a dated request outranks
 * an undated one and, among equals, the oldest ask leads. `nullsFirst: false` is what
 * keeps an undated request from sorting ahead of one due tomorrow.
 */
export async function listCaseDocumentRequests(
  caseId: string,
  db?: CaseAuthorizationClient,
): Promise<DocumentRequestListResult> {
  if (!isPresent(caseId)) return { ok: false, reason: "lookup-failed" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("case_document_requests")
      .select("id, kind, title, note, status, due_at, created_at, resolved_at")
      .eq("case_id", caseId)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    // A read that could not complete is an outage, NEVER an empty chase list. The
    // two render as "we could not find out" and "nothing outstanding", and only one
    // of them is true — telling a counsellor a case is clear when it may not be is
    // the failure this branch exists to prevent.
    if (error) return { ok: false, reason: "lookup-failed" };
    const rows = data ?? [];
    // At the ceiling the answer MAY be a prefix, and PostgREST does not say so.
    if (rows.length >= DOCUMENT_REQUEST_ROW_CEILING) return { ok: false, reason: "lookup-failed" };

    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        note: row.note,
        status: row.status,
        dueAt: row.due_at,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
      })),
    };
  } catch {
    return { ok: false, reason: "lookup-failed" };
  }
}

export type DocumentRequestLookupResult =
  | { ok: true; data: CaseDocumentRequest | null }
  | { ok: false; reason: "lookup-failed" };

/**
 * ONE request, resolved by id AND by case — MV-186's upload route reads it before it
 * writes a version against it.
 *
 * BOTH filters, the same reason `resolveCaseDocumentRequest` gives: the caller authorized
 * ONE case, so without the `case_id` predicate a request id from another case the actor
 * happens to staff would resolve under this case's authorization.
 *
 * ## Why the route reads this at all, when the policy already bounds it
 *
 * `case_document_versions_insert_staff`'s THIRD conjunct is
 * `private.document_request_case_id(request_id) = case_id`, so a version can never hang off
 * another case's request. But a policy refusal arrives as `42501`, which the route maps to
 * DENIED and the user reads as "you may not do this" — when the truth is "there is no such
 * request here". Reading first is what keeps those two answers apart; the conjunct is what
 * makes it safe if the read is ever wrong.
 */
export async function getCaseDocumentRequest(
  requestId: string,
  caseId: string,
  db?: CaseAuthorizationClient,
): Promise<DocumentRequestLookupResult> {
  if (!isPresent(requestId) || !isPresent(caseId)) return { ok: false, reason: "lookup-failed" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("case_document_requests")
      .select("id, kind, title, note, status, due_at, created_at, resolved_at")
      .eq("id", requestId)
      .eq("case_id", caseId)
      .maybeSingle();

    // An absent request and a FAILED lookup are different sentences to the user, and only
    // one of them says anything about the request existing.
    if (error) return { ok: false, reason: "lookup-failed" };
    if (!data) return { ok: true, data: null };
    return {
      ok: true,
      data: {
        id: data.id,
        kind: data.kind,
        title: data.title,
        note: data.note,
        status: data.status,
        dueAt: data.due_at,
        createdAt: data.created_at,
        resolvedAt: data.resolved_at,
      },
    };
  } catch {
    return { ok: false, reason: "lookup-failed" };
  }
}

/**
 * The queue's batch size (MV-183). Matches `queue-repo.ts`'s `QUEUE_BATCH_SIZE` in
 * value but is stated here rather than imported, because importing it would make
 * this module depend on the module that depends on it.
 *
 * supabase-js sends `.in()` as a URL querystring, so a whole page of case ids in
 * one request is a URL some proxy will refuse — the same reasoning, and the same
 * number, `queue-repo.ts` applies to its assignment read.
 */
export const REQUEST_BATCH_SIZE = 40;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type OutstandingRequestsByCaseResult =
  | { ok: true; byCase: Map<string, CaseDocumentRequest[]> }
  | { ok: false; reason: "lookup-failed" };

/**
 * Every OUTSTANDING request across many cases, grouped by case — the Day view's
 * lodgement column (MV-183, spec §2).
 *
 * ONE QUERY PER CHUNK, never one per case. Forty rows on the queue landing page
 * would otherwise be forty round trips; MV-182's migration created
 * `case_document_requests_case_id_status_idx on (case_id, status)` for precisely
 * this access shape.
 *
 * ## Why outstanding rows ONLY
 *
 * Resolved requests are never deleted — the migration is explicit that a request
 * that was asked for is a permanent fact — so they accumulate on a case forever. A
 * batch fetching every status would grow with a consultancy's history rather than
 * with its open work, and at PostgREST's `max_rows` it would be SILENTLY cut,
 * dropping outstanding rows from the cases at the tail of the chunk. Those cases
 * would then render "Nothing outstanding" on a queue, which is the single most
 * expensive wrong sentence this slice can print.
 *
 * The cost is that a caller cannot tell an all-resolved case from one nobody has
 * asked anything of. `deriveQueueLodgement` spends that honestly by reporting the
 * weaker `none-outstanding`; the case panel, which reads the whole list through
 * `listCaseDocumentRequests`, keeps the distinction.
 *
 * A case with nothing outstanding is ABSENT from the map rather than present with
 * an empty array — there is one representation of "no outstanding rows", so no
 * caller can read the two differently.
 */
export async function listOutstandingDocumentRequestsByCase(
  caseIds: readonly string[],
  db?: CaseAuthorizationClient,
): Promise<OutstandingRequestsByCaseResult> {
  const byCase = new Map<string, CaseDocumentRequest[]>();
  const ids = caseIds.filter(isPresent);
  // No cases means no question. An empty `.in()` is a query that can only return
  // nothing, and PostgREST is not the place to find that out.
  if (ids.length === 0) return { ok: true, byCase };

  try {
    const supabase = await client(db);

    for (const batch of chunk(ids, REQUEST_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("case_document_requests")
        .select("id, case_id, kind, title, note, status, due_at, created_at, resolved_at")
        // Filtered at the DATABASE, so the row ceiling below bounds outstanding work
        // rather than a consultancy's whole request history.
        .eq("status", "outstanding")
        .in("case_id", batch);

      // Same rule as `listCaseDocumentRequests`: a read that could not complete is
      // an outage, NEVER an empty chase list.
      if (error) return { ok: false, reason: "lookup-failed" };
      const rows = data ?? [];
      // At the ceiling the answer MAY be a prefix, and PostgREST does not say so.
      if (rows.length >= DOCUMENT_REQUEST_ROW_CEILING) return { ok: false, reason: "lookup-failed" };

      for (const row of rows) {
        const existing = byCase.get(row.case_id) ?? [];
        existing.push({
          id: row.id,
          kind: row.kind,
          title: row.title,
          note: row.note,
          status: row.status,
          dueAt: row.due_at,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at,
        });
        byCase.set(row.case_id, existing);
      }
    }

    return { ok: true, byCase };
  } catch {
    return { ok: false, reason: "lookup-failed" };
  }
}

/**
 * Ask this case for one document.
 *
 * Authorization is the CALLER's — `requireCasePermission(actor, caseId,
 * "case.documents.request")`. This function does not re-decide it; it is the data
 * access behind an already-authorized decision, and
 * `case_document_requests_insert_staff` is the layer that cannot be talked out of it.
 *
 * ## Why the organization is READ rather than accepted
 *
 * The INSERT policy pins `organization_id` to `private.case_org_id(case_id)`, so a
 * caller-supplied value could only ever agree with the case's real organization or
 * be refused. Resolving it here makes the column right by construction instead of
 * turning a caller's bug into a `42501` the user reads as "you may not do this" —
 * and it gives the two genuinely different refusals their own names: a case that
 * does not exist, and a PERSONAL case, which has no organization and therefore can
 * carry no consultancy request at all.
 *
 * The read is issued on the SAME authenticated client, so it is RLS-scoped: a case
 * the actor cannot see resolves to `unknown-case`, which is the honest answer and
 * not an existence oracle.
 */
export async function createCaseDocumentRequest(
  actorUserId: string,
  caseId: string,
  input: DocumentRequestInput,
  db?: CaseAuthorizationClient,
): Promise<DocumentRequestCreateResult> {
  // A blank identifier can only come from a bug or a probe; neither earns a query.
  if (!isPresent(actorUserId) || !isPresent(caseId)) return { ok: false, reason: "invalid-input" };

  const kind = (input.kind ?? "").trim();
  // The guard between user input and the check constraint. A value the constraint
  // does not admit is refused here rather than sent as a write that can only ever
  // raise `23514`.
  if (!isDocumentKind(kind)) return { ok: false, reason: "invalid-input" };

  const title = (input.title ?? "").trim();
  if (title === "") return { ok: false, reason: "invalid-input" };

  // Blank is stored as NULL, never as "". `note` is nullable and "no instruction"
  // is a real state; an empty string would be a third value that renders as an
  // instruction the counsellor did not write.
  const note = (input.note ?? "").trim();
  const dueAt = (input.dueAt ?? "").trim();

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
      .from("case_document_requests")
      .insert({
        case_id: caseId,
        organization_id: organizationId,
        kind,
        title,
        note: note === "" ? null : note,
        due_at: dueAt === "" ? null : dueAt,
        // Provenance, pinned to the actor by the policy's third conjunct. Writing
        // anything else here is a write the database refuses.
        requested_by: actorUserId,
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
 * Mark one request resolved.
 *
 * `status` is the ONLY column written, and that is not a style choice: it is the
 * only column granted. `resolved_at` is stamped by
 * `private.stamp_document_request_resolution()` and naming it in this payload would
 * make every resolve a plan-time `42501`.
 *
 * BOTH the id and the case are filters. The caller authorized
 * `case.documents.request` for ONE case; without the `case_id` predicate the request
 * id alone would decide which row moves, so an id belonging to a different case the
 * actor happens to staff would be mutated under this case's authorization. RLS would
 * still hold the tenant boundary — but "the tenant boundary held" is not the same as
 * "the row the user was looking at is the row that changed".
 */
export async function resolveCaseDocumentRequest(
  requestId: string,
  caseId: string,
  db?: CaseAuthorizationClient,
): Promise<DocumentRequestResolveResult> {
  if (!isPresent(requestId) || !isPresent(caseId)) return { ok: false, reason: "invalid-input" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("case_document_requests")
      .update({ status: "resolved" })
      .eq("id", requestId)
      .eq("case_id", caseId)
      .select("id");

    if (error) return { ok: false, reason: writeFailure(error.code) };
    // Zero rows is how `case_document_requests_update_staff` refuses, and it is also
    // how a request belonging to another case fails the `case_id` filter. Both are a
    // denial and neither is a success.
    if (!data || data.length === 0) return { ok: false, reason: "denied" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}
