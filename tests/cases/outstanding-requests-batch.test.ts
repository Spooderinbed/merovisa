import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DOCUMENT_REQUEST_ROW_CEILING,
  REQUEST_BATCH_SIZE,
  listOutstandingDocumentRequestsByCase,
} from "@/lib/cases/document-requests-repo";
import { fakeCaseDb, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

/**
 * MV-183 — the queue's batched lodgement read.
 *
 * The Day view renders up to forty rows and every one of them wants a lodgement
 * read, so the read is BATCHED: one query per chunk of case ids, never one query
 * per case. `case_document_requests_case_id_status_idx on (case_id, status)` was
 * built by MV-182's migration for exactly this shape.
 *
 * It lives in `document-requests-repo.ts` rather than in `queue-repo.ts` because
 * that module is the ONE access path to this table — every read and write against
 * `case_document_requests` goes through it, so RLS-scoping, the row ceiling and the
 * outage semantics are stated once.
 *
 * OUTSTANDING ROWS ONLY. Resolved requests are kept forever, so a forty-case batch
 * fetching every status could quietly cross PostgREST's `max_rows` on a busy
 * organization and turn the whole column into an outage. The cost is that the queue
 * cannot tell an all-resolved case from an untouched one — which is why
 * `deriveQueueLodgement` reports the weaker `none-outstanding` rather than `clear`.
 */

const CASE_A = "11111111-1111-4111-8111-111111111111";
const CASE_B = "22222222-2222-4222-8222-222222222222";
const CASE_C = "33333333-3333-4333-8333-333333333333";

function fixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return {
    case_document_requests: [
      {
        id: "req-a1",
        case_id: CASE_A,
        title: "Passport bio page",
        status: "outstanding",
        due_at: "2026-08-20T00:00:00.000Z",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "req-a2",
        case_id: CASE_A,
        title: "Bank statement",
        status: "resolved",
        due_at: "2026-08-02T00:00:00.000Z",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "req-b1",
        case_id: CASE_B,
        title: "Sponsor letter",
        status: "outstanding",
        due_at: null,
        created_at: "2026-08-03T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("listOutstandingDocumentRequestsByCase — one query for N cases", () => {
  test("returns outstanding rows grouped by case", async () => {
    const { client } = fakeCaseDb(fixture());

    const result = await listOutstandingDocumentRequestsByCase([CASE_A, CASE_B, CASE_C], client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.byCase.get(CASE_A)?.map((r) => r.id)).toEqual(["req-a1"]);
    expect(result.byCase.get(CASE_B)?.map((r) => r.id)).toEqual(["req-b1"]);
    // A case with nothing outstanding is ABSENT rather than present-and-empty; the
    // caller reads a missing key as "no outstanding rows", which is what it means.
    expect(result.byCase.has(CASE_C)).toBe(false);
  });

  test("a resolved request never reaches the caller", async () => {
    const { client } = fakeCaseDb(fixture());

    const result = await listOutstandingDocumentRequestsByCase([CASE_A], client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.byCase.get(CASE_A)?.map((r) => r.id)).not.toContain("req-a2");
  });

  test("filters on status at the database, not in memory", async () => {
    const { client, queries } = fakeCaseDb(fixture());

    await listOutstandingDocumentRequestsByCase([CASE_A, CASE_B], client);

    const read = queries.find((q) => q.table === "case_document_requests");
    expect(read?.filters).toContainEqual(["status", "outstanding"]);
  });

  test("BATCHED: forty cases cost one query, not forty", async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `case-${String(i).padStart(3, "0")}`);
    const { client, queries } = fakeCaseDb({
      case_document_requests: ids.map((caseId, i) => ({
        id: `req-${i}`,
        case_id: caseId,
        title: "Passport bio page",
        status: "outstanding",
        due_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
      })),
    });

    const result = await listOutstandingDocumentRequestsByCase(ids, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.byCase.size).toBe(40);
    expect(queries.filter((q) => q.table === "case_document_requests")).toHaveLength(1);
  });

  test("chunks beyond the batch size rather than sending one enormous URL", async () => {
    // supabase-js sends `.in()` as a querystring; `queue-repo.ts` chunks for the same
    // reason. Two chunks for 41 ids — still O(chunks), never O(cases).
    const ids = Array.from({ length: REQUEST_BATCH_SIZE + 1 }, (_, i) => `case-${i}`);
    const { client, queries } = fakeCaseDb({ case_document_requests: [] });

    await listOutstandingDocumentRequestsByCase(ids, client);

    expect(queries.filter((q) => q.table === "case_document_requests")).toHaveLength(2);
  });

  test("no case ids means no query at all", async () => {
    const { client, queries } = fakeCaseDb(fixture());

    const result = await listOutstandingDocumentRequestsByCase([], client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.byCase.size).toBe(0);
    expect(queries.filter((q) => q.table === "case_document_requests")).toHaveLength(0);
  });
});

describe("listOutstandingDocumentRequestsByCase — a failed read is an outage, never emptiness", () => {
  test("a PostgREST error reports lookup-failed", async () => {
    const { client } = fakeCaseDb(fixture(), {
      errorOn: { case_document_requests: { message: "boom" } },
    });

    await expect(listOutstandingDocumentRequestsByCase([CASE_A], client)).resolves.toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  test("a thrown client reports lookup-failed", async () => {
    const { client } = fakeCaseDb(fixture(), { throwOn: ["case_document_requests"] });

    await expect(listOutstandingDocumentRequestsByCase([CASE_A], client)).resolves.toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  test("a chunk at the row ceiling is an outage — PostgREST truncates silently", async () => {
    const rows = Array.from({ length: DOCUMENT_REQUEST_ROW_CEILING }, (_, i) => ({
      id: `req-${i}`,
      case_id: CASE_A,
      title: "Passport bio page",
      status: "outstanding",
      due_at: null,
      created_at: "2026-08-01T00:00:00.000Z",
    }));
    const { client } = fakeCaseDb({ case_document_requests: rows });

    // A possibly-truncated answer would drop outstanding requests from cases at the
    // tail of the chunk, and those cases would render "Nothing outstanding" — the
    // exact false reassurance this whole slice exists to avoid.
    await expect(listOutstandingDocumentRequestsByCase([CASE_A], client)).resolves.toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });
});
