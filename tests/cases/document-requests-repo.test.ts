import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DOCUMENT_KINDS } from "@/lib/documents/types";
import {
  DOCUMENT_REQUEST_ROW_CEILING,
  createCaseDocumentRequest,
  listCaseDocumentRequests,
  resolveCaseDocumentRequest,
} from "@/lib/cases/document-requests-repo";
import { fakeCaseDb, sawQuery, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

/**
 * MV-182 — the chase list's data layer.
 *
 * The two rules every assertion here is built on are the ones `write-repo.ts` states
 * for the whole `lib/cases/` write surface, and both are invisible in a happy-path
 * test:
 *
 *  1. **A PostgREST error RESOLVES rather than rejects.** `throwOnError` has zero
 *     hits repo-wide, so a call site that does not destructure `error` drops the
 *     write and reports success.
 *  2. **A policy refusal is not an error** — Postgres reports it as zero rows
 *     affected. So an UPDATE has to read its rows back, or a refused write and a
 *     successful one are the same value.
 */

const CASE_A = "11111111-1111-4111-8111-111111111111";
const CASE_B = "22222222-2222-4222-8222-222222222222";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "99999999-9999-4999-8999-999999999999";

function fixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return {
    cases: [
      { id: CASE_A, organization_id: ORG_A },
      { id: CASE_B, organization_id: ORG_A },
    ],
    case_document_requests: [],
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    case_id: CASE_A,
    organization_id: ORG_A,
    kind: "passport",
    title: "Passport bio page",
    note: null,
    status: "outstanding",
    due_at: null,
    requested_by: ACTOR,
    created_at: "2026-08-18T00:00:00.000Z",
    updated_at: "2026-08-18T00:00:00.000Z",
    resolved_at: null,
    ...overrides,
  };
}

describe("listCaseDocumentRequests — one case's chase list", () => {
  test("reads only the requests of the case it was handed", async () => {
    const { client, queries } = fakeCaseDb(
      fixture({
        case_document_requests: [
          request({ id: "mine", case_id: CASE_A }),
          request({ id: "someone-elses", case_id: CASE_B }),
        ],
      }),
    );

    const result = await listCaseDocumentRequests(CASE_A, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((row) => row.id)).toEqual(["mine"]);
    // The scoping is a FILTER, not a post-read discard: a repository that read the
    // table unfiltered and dropped the wrong rows in memory would pass the
    // assertion above while shipping another case's data over the wire.
    expect(sawQuery(queries, "case_document_requests", [["case_id", CASE_A]])).toBe(true);
  });

  test("maps a row onto the shape the surface renders, without carrying requested_by", async () => {
    const { client } = fakeCaseDb(
      fixture({
        case_document_requests: [
          request({
            id: "req-9",
            kind: "bank-statement",
            title: "Father's bank statement",
            note: "Last six months, stamped.",
            status: "resolved",
            due_at: "2026-09-01T00:00:00.000Z",
            resolved_at: "2026-08-20T00:00:00.000Z",
          }),
        ],
      }),
    );

    const result = await listCaseDocumentRequests(CASE_A, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toEqual({
      id: "req-9",
      kind: "bank-statement",
      title: "Father's bank statement",
      note: "Last six months, stamped.",
      status: "resolved",
      dueAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-08-18T00:00:00.000Z",
      resolvedAt: "2026-08-20T00:00:00.000Z",
    });
    // `requested_by` is a raw Auth user id. It is provenance the database keeps and
    // Stage 6's audit reads; it is no use to a counsellor and does not belong in
    // markup — the same rule MV-170 applied to `student_user_id`.
    expect(Object.keys(result.data[0]!)).not.toContain("requestedBy");
  });

  test("asks the database to order by due date, then by age", async () => {
    const { client, queries } = fakeCaseDb(fixture());

    await listCaseDocumentRequests(CASE_A, client);

    const read = queries.find((q) => q.table === "case_document_requests");
    expect(read?.order).toEqual([
      ["due_at", { ascending: true, nullsFirst: false }],
      ["created_at", { ascending: true }],
    ]);
  });

  test("a read that FAILED is lookup-failed, never an empty chase list", async () => {
    const { client } = fakeCaseDb(fixture(), {
      errorOn: { case_document_requests: { message: "boom" } },
    });

    const result = await listCaseDocumentRequests(CASE_A, client);

    // "Nothing outstanding" and "we could not find out" are different sentences and
    // only one of them is true. Rendering the first for the second tells a
    // counsellor a case is clear when it may not be.
    expect(result).toEqual({ ok: false, reason: "lookup-failed" });
  });

  test("a thrown client is caught, not propagated", async () => {
    const { client } = fakeCaseDb(fixture(), { throwOn: ["case_document_requests"] });

    await expect(listCaseDocumentRequests(CASE_A, client)).resolves.toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  test("a read at PostgREST's row ceiling is an outage, because it MAY be a prefix", async () => {
    const rows = Array.from({ length: DOCUMENT_REQUEST_ROW_CEILING }, (_, i) =>
      request({ id: `req-${i}` }),
    );
    const { client } = fakeCaseDb(fixture({ case_document_requests: rows }));

    // `max_rows` truncates SILENTLY. Staff hold a case-scoped INSERT policy and
    // nothing in the database bounds requests per case, so a full page may be a
    // prefix — and a prefix here is a chase list that omits outstanding items.
    await expect(listCaseDocumentRequests(CASE_A, client)).resolves.toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  test("a blank case id is refused without a query", async () => {
    const { client, queries } = fakeCaseDb(fixture());

    await expect(listCaseDocumentRequests("  ", client)).resolves.toEqual({
      ok: false,
      reason: "lookup-failed",
    });
    expect(queries).toHaveLength(0);
  });
});

describe("createCaseDocumentRequest — asking the case for something", () => {
  test("writes the row against the case's OWN organization, and names the actor", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    const result = await createCaseDocumentRequest(
      ACTOR,
      CASE_A,
      { kind: "ielts", title: "IELTS Scorecard", note: "Academic, not General.", dueAt: null },
      client,
    );

    expect(result.ok).toBe(true);
    const row = inserts.find((i) => i.table === "case_document_requests")?.row;
    expect(row).toMatchObject({
      case_id: CASE_A,
      // Read from `cases`, NOT taken from the caller. The INSERT policy pins this to
      // `private.case_org_id(case_id)` anyway, so a caller-supplied value could only
      // ever agree or be refused — resolving it here turns a predictable 42501 into
      // a value that is right by construction.
      organization_id: ORG_A,
      kind: "ielts",
      title: "IELTS Scorecard",
      note: "Academic, not General.",
      requested_by: ACTOR,
    });
  });

  test("never writes status or resolved_at — neither column is granted", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    await createCaseDocumentRequest(ACTOR, CASE_A, { kind: "coe", title: "CoE" }, client);

    const row = inserts.find((i) => i.table === "case_document_requests")!.row;
    // A payload column with no INSERT grant is a plan-time 42501 for the WHOLE
    // statement, so naming either of these would break every create — including the
    // ones that look unrelated to resolution.
    expect(Object.keys(row).sort()).toEqual(
      ["case_id", "due_at", "kind", "note", "organization_id", "requested_by", "title"].sort(),
    );
  });

  test("a kind outside the document vocabulary is refused before it reaches the check constraint", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    const result = await createCaseDocumentRequest(
      ACTOR,
      CASE_A,
      { kind: "vibes", title: "Vibes" },
      client,
    );

    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(inserts).toHaveLength(0);
  });

  test("every kind the vault knows is accepted", async () => {
    for (const kind of DOCUMENT_KINDS) {
      const { client } = fakeCaseDb(fixture());
      const result = await createCaseDocumentRequest(ACTOR, CASE_A, { kind, title: "x" }, client);
      expect(result.ok, `kind ${kind} was refused`).toBe(true);
    }
  });

  test("a blank title is refused, and a blank note is stored as NULL", async () => {
    const { client: blankTitleClient } = fakeCaseDb(fixture());
    await expect(
      createCaseDocumentRequest(ACTOR, CASE_A, { kind: "passport", title: "   " }, blankTitleClient),
    ).resolves.toEqual({ ok: false, reason: "invalid-input" });

    const { client, inserts } = fakeCaseDb(fixture());
    await createCaseDocumentRequest(ACTOR, CASE_A, { kind: "passport", title: "P", note: "  " }, client);
    // "" would be a third value that renders as an instruction the counsellor did
    // not write — the same reasoning `createOrgCase` states for `cases.email`.
    expect(inserts[0]!.row.note).toBeNull();
  });

  test("a personal case has no organization, so it can carry no request", async () => {
    const { client, inserts } = fakeCaseDb({
      cases: [{ id: CASE_A, organization_id: null }],
      case_document_requests: [],
    });

    const result = await createCaseDocumentRequest(ACTOR, CASE_A, { kind: "passport", title: "P" }, client);

    // The INSERT policy refuses it too (`organization_id = case_org_id(case_id)` is
    // NULL there, and a WITH CHECK admits only TRUE). Refusing here names WHY.
    expect(result).toEqual({ ok: false, reason: "not-an-org-case" });
    expect(inserts).toHaveLength(0);
  });

  test("an unknown case is not an insert that fails, it is a case that is not there", async () => {
    const { client, inserts } = fakeCaseDb({ cases: [], case_document_requests: [] });

    await expect(
      createCaseDocumentRequest(ACTOR, CASE_A, { kind: "passport", title: "P" }, client),
    ).resolves.toEqual({ ok: false, reason: "unknown-case" });
    expect(inserts).toHaveLength(0);
  });

  test("42501 is `denied`, and anything else is `write-failed`", async () => {
    const denied = fakeCaseDb(fixture(), {
      insertError: { case_document_requests: { code: "42501", message: "rls" } },
    });
    await expect(
      createCaseDocumentRequest(ACTOR, CASE_A, { kind: "passport", title: "P" }, denied.client),
    ).resolves.toEqual({ ok: false, reason: "denied" });

    const broken = fakeCaseDb(fixture(), {
      insertError: { case_document_requests: { code: "08006", message: "gone" } },
    });
    // The two must never collapse: one means "ask someone", the other "try again".
    await expect(
      createCaseDocumentRequest(ACTOR, CASE_A, { kind: "passport", title: "P" }, broken.client),
    ).resolves.toEqual({ ok: false, reason: "write-failed" });
  });

  test("a blank actor or case id is refused without touching the database", async () => {
    const { client, queries, inserts } = fakeCaseDb(fixture());

    await expect(
      createCaseDocumentRequest("", CASE_A, { kind: "passport", title: "P" }, client),
    ).resolves.toEqual({ ok: false, reason: "invalid-input" });
    await expect(
      createCaseDocumentRequest(ACTOR, "", { kind: "passport", title: "P" }, client),
    ).resolves.toEqual({ ok: false, reason: "invalid-input" });
    expect(queries).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});

describe("resolveCaseDocumentRequest — and the case scoping that makes it safe", () => {
  test("resolves a request that belongs to the case", async () => {
    const { client, updates } = fakeCaseDb(
      fixture({ case_document_requests: [request({ id: "req-1", case_id: CASE_A })] }),
    );

    const result = await resolveCaseDocumentRequest("req-1", CASE_A, client);

    expect(result).toEqual({ ok: true });
    // `status` alone. `resolved_at` is stamped by the trigger and carries no grant,
    // so naming it would make every resolve a plan-time 42501.
    expect(updates).toEqual([{ table: "case_document_requests", patch: { status: "resolved" } }]);
  });

  test("FILTERS ON THE CASE AS WELL AS THE ID — a request from another case is not resolvable here", async () => {
    const { client } = fakeCaseDb(
      fixture({ case_document_requests: [request({ id: "req-1", case_id: CASE_B })] }),
    );

    // The page authorized `case.documents.request` for CASE_A. Without the case
    // filter the request id alone would decide which row moves, so an id belonging
    // to a DIFFERENT case the actor happens to staff would be mutated under this
    // case's authorization — the F-8 defect class, exactly.
    const result = await resolveCaseDocumentRequest("req-1", CASE_A, client);

    expect(result).toEqual({ ok: false, reason: "denied" });
  });

  test("carries both predicates onto the statement", async () => {
    const { client, queries } = fakeCaseDb(
      fixture({ case_document_requests: [request({ id: "req-1" })] }),
    );

    await resolveCaseDocumentRequest("req-1", CASE_A, client);

    expect(
      sawQuery(queries, "case_document_requests", [
        ["id", "req-1"],
        ["case_id", CASE_A],
      ]),
    ).toBe(true);
  });

  test("zero rows is a denial, not a success", async () => {
    const { client } = fakeCaseDb(fixture({ case_document_requests: [] }));

    // A policy refusal affects zero rows and raises nothing. A repository that did
    // not read its rows back would return the same value as a successful resolve.
    await expect(resolveCaseDocumentRequest("req-1", CASE_A, client)).resolves.toEqual({
      ok: false,
      reason: "denied",
    });
  });

  test("42501 is `denied`, another error is `write-failed`, a throw is caught", async () => {
    const denied = fakeCaseDb(fixture({ case_document_requests: [request()] }), {
      updateError: { case_document_requests: { code: "42501", message: "grant" } },
    });
    await expect(resolveCaseDocumentRequest("req-1", CASE_A, denied.client)).resolves.toEqual({
      ok: false,
      reason: "denied",
    });

    const broken = fakeCaseDb(fixture({ case_document_requests: [request()] }), {
      updateError: { case_document_requests: { code: "08006", message: "gone" } },
    });
    await expect(resolveCaseDocumentRequest("req-1", CASE_A, broken.client)).resolves.toEqual({
      ok: false,
      reason: "write-failed",
    });

    const thrown = fakeCaseDb(fixture(), { throwOn: ["case_document_requests"] });
    await expect(resolveCaseDocumentRequest("req-1", CASE_A, thrown.client)).resolves.toEqual({
      ok: false,
      reason: "write-failed",
    });
  });

  test("a blank id or case id is refused without touching the database", async () => {
    const { client, updates } = fakeCaseDb(fixture());

    await expect(resolveCaseDocumentRequest("", CASE_A, client)).resolves.toEqual({
      ok: false,
      reason: "invalid-input",
    });
    await expect(resolveCaseDocumentRequest("req-1", "", client)).resolves.toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(updates).toHaveLength(0);
  });
});
