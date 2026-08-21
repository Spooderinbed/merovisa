import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  COLLABORATION_ROW_CEILING,
  createCaseDocumentReview,
  createCaseDocumentVersion,
  getCaseDocumentVersion,
  listCaseDocumentReviews,
  listCaseDocumentVersions,
} from "@/lib/cases/document-collaboration-repo";
import { fakeCaseDb, sawQuery, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

/**
 * MV-186 — the collaboration data layer.
 *
 * The three rules every assertion here rests on, all invisible in a happy path:
 *
 *  1. **A PostgREST error RESOLVES rather than rejects.** `throwOnError` has zero
 *     hits repo-wide, so a call site that does not destructure `error` drops the
 *     write and reports success (MISTAKES.md, "Silent failures").
 *  2. **A read that FAILED is not an empty list.** An empty version history and a
 *     failed one render as "nothing has arrived" and "we could not find out", and
 *     only one of them is true.
 *  3. **Both tables are APPEND-ONLY.** MV-185 grants no UPDATE and no DELETE on
 *     either, so this module exposes no verb that would need one — asserted below
 *     on the module's own surface, because the cheapest way to reintroduce a
 *     `42501` is to add a helper nobody calls yet.
 */

const CASE_A = "11111111-1111-4111-8111-111111111111";
const CASE_B = "22222222-2222-4222-8222-222222222222";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const VERSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REQUEST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PATH = `case/${CASE_A}/${VERSION_ID}`;

function fixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return {
    cases: [
      { id: CASE_A, organization_id: ORG_A },
      { id: CASE_B, organization_id: ORG_A },
    ],
    case_document_versions: [],
    case_document_reviews: [],
    ...overrides,
  };
}

function versionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VERSION_ID,
    case_id: CASE_A,
    organization_id: ORG_A,
    request_id: REQUEST_ID,
    document_id: null,
    storage_path: PATH,
    file_size: 2048,
    original_name: "passport.pdf",
    content_type: "application/pdf",
    uploaded_by: ACTOR,
    created_at: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rev-1",
    case_id: CASE_A,
    organization_id: ORG_A,
    version_id: VERSION_ID,
    decision: "accepted",
    note: null,
    reviewed_by: ACTOR,
    created_at: "2026-08-20T11:00:00.000Z",
    ...overrides,
  };
}

const input = (over: Record<string, unknown> = {}) => ({
  id: VERSION_ID,
  requestId: REQUEST_ID,
  storagePath: PATH,
  fileSize: 2048,
  originalName: "passport.pdf",
  contentType: "application/pdf",
  ...over,
});

describe("listCaseDocumentVersions", () => {
  test("reads only the versions of the case it was handed", async () => {
    const { client, queries } = fakeCaseDb(
      fixture({
        case_document_versions: [
          versionRow({ id: "mine", case_id: CASE_A }),
          versionRow({ id: "someone-elses", case_id: CASE_B }),
        ],
      }),
    );

    const result = await listCaseDocumentVersions(CASE_A, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((row) => row.id)).toEqual(["mine"]);
    // A FILTER, not a post-read discard: a repository that read the table
    // unfiltered and dropped the wrong rows in memory would pass the assertion
    // above while shipping another case's data over the wire.
    expect(sawQuery(queries, "case_document_versions", [["case_id", CASE_A]])).toBe(true);
  });

  test("maps a row onto the shape the surface renders", async () => {
    const { client } = fakeCaseDb(fixture({ case_document_versions: [versionRow()] }));

    const result = await listCaseDocumentVersions(CASE_A, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toEqual({
      id: VERSION_ID,
      requestId: REQUEST_ID,
      storagePath: PATH,
      fileSize: 2048,
      originalName: "passport.pdf",
      contentType: "application/pdf",
      createdAt: "2026-08-20T10:00:00.000Z",
    });
  });

  test("does NOT carry uploaded_by — a raw Auth user id does not belong in markup", async () => {
    const { client } = fakeCaseDb(fixture({ case_document_versions: [versionRow()] }));

    const result = await listCaseDocumentVersions(CASE_A, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // MV-170's rule, and MV-182's for `requested_by`: the column exists so the
    // INSERT policy has something truthful to pin and so Stage 6's audit has
    // provenance to read — not so a list can print it.
    expect(Object.keys(result.data[0]!)).not.toContain("uploadedBy");
    expect(JSON.stringify(result.data)).not.toContain(ACTOR);
  });

  test("a read that FAILED is an outage, never an empty history", async () => {
    const { client } = fakeCaseDb(fixture(), {
      errorOn: { case_document_versions: { message: "boom" } },
    });

    const result = await listCaseDocumentVersions(CASE_A, client);

    // "Nothing has arrived" would tell a counsellor to chase a student for a file
    // that may already be sitting in front of them.
    expect(result).toEqual({ ok: false, reason: "lookup-failed" });
  });

  test("a read AT the row ceiling is an outage, because PostgREST does not say it truncated", async () => {
    const many = Array.from({ length: COLLABORATION_ROW_CEILING }, (_, i) =>
      versionRow({ id: `v-${i}` }),
    );
    const { client } = fakeCaseDb(fixture({ case_document_versions: many }));

    const result = await listCaseDocumentVersions(CASE_A, client);

    expect(result).toEqual({ ok: false, reason: "lookup-failed" });
  });

  test("a thrown client is a failure, never a success", async () => {
    const { client } = fakeCaseDb(fixture(), { throwOn: ["case_document_versions"] });
    expect(await listCaseDocumentVersions(CASE_A, client)).toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  test("a blank case id never reaches the database", async () => {
    const { client, queries } = fakeCaseDb(fixture());
    expect(await listCaseDocumentVersions("", client)).toEqual({ ok: false, reason: "lookup-failed" });
    expect(queries).toHaveLength(0);
  });
});

describe("listCaseDocumentReviews", () => {
  test("reads only the reviews of the case it was handed, and maps them", async () => {
    const { client, queries } = fakeCaseDb(
      fixture({
        case_document_reviews: [
          reviewRow({ id: "mine", case_id: CASE_A, note: "Page is cut off", decision: "rejected" }),
          reviewRow({ id: "someone-elses", case_id: CASE_B }),
        ],
      }),
    );

    const result = await listCaseDocumentReviews(CASE_A, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([
      {
        id: "mine",
        versionId: VERSION_ID,
        decision: "rejected",
        // The NOTE travels. It is the half of this model that is any use to the
        // student, and MV-185's policy comment says so out loud.
        note: "Page is cut off",
        createdAt: "2026-08-20T11:00:00.000Z",
      },
    ]);
    expect(sawQuery(queries, "case_document_reviews", [["case_id", CASE_A]])).toBe(true);
  });

  test("does NOT carry reviewed_by", async () => {
    const { client } = fakeCaseDb(fixture({ case_document_reviews: [reviewRow()] }));
    const result = await listCaseDocumentReviews(CASE_A, client);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.data)).not.toContain(ACTOR);
  });

  test("a read that FAILED is an outage, never an empty review list", async () => {
    const { client } = fakeCaseDb(fixture(), {
      errorOn: { case_document_reviews: { message: "boom" } },
    });
    expect(await listCaseDocumentReviews(CASE_A, client)).toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });
});

describe("createCaseDocumentVersion", () => {
  test("writes the CLIENT-GENERATED id, so the row names the object already uploaded", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    const result = await createCaseDocumentVersion(ACTOR, CASE_A, input(), client);

    expect(result).toEqual({ ok: true, id: VERSION_ID });
    const row = inserts.find((i) => i.table === "case_document_versions")?.row;
    // MV-190 granted `insert (id)` precisely so ONE statement writes a consistent
    // `id` and `storage_path`. A server-issued id would force insert-then-upload,
    // and a failed upload would strand a row pointing at bytes that do not exist —
    // with no DELETE grant to retract it (spec §6.2).
    expect(row?.id).toBe(VERSION_ID);
    expect(row?.storage_path).toBe(PATH);
  });

  test("reads the organization off the case rather than accepting one", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    await createCaseDocumentVersion(ACTOR, CASE_A, input(), client);

    const row = inserts.find((i) => i.table === "case_document_versions")?.row;
    // The INSERT policy pins `organization_id = private.case_org_id(case_id)`, so a
    // caller-supplied value could only agree or be refused. Resolving it here makes
    // the column right by construction instead of turning a caller's bug into a
    // `42501` the user reads as "you may not do this".
    expect(row?.organization_id).toBe(ORG_A);
  });

  test("pins provenance to the actor, never to a value the caller chose", async () => {
    const { client, inserts } = fakeCaseDb(fixture());
    await createCaseDocumentVersion(ACTOR, CASE_A, input(), client);
    const row = inserts.find((i) => i.table === "case_document_versions")?.row;
    expect(row?.uploaded_by).toBe(ACTOR);
  });

  test("writes document_id as NULL — this slice never touches the vault", async () => {
    const { client, inserts } = fakeCaseDb(fixture());
    await createCaseDocumentVersion(ACTOR, CASE_A, input(), client);
    const row = inserts.find((i) => i.table === "case_document_versions")?.row;
    // Spec §7.5 (D10): `documents` is UNIQUE (case_id, kind), so pointing a version
    // at the vault would silently REPLACE the student's current file for that kind.
    expect(row?.document_id).toBeNull();
  });

  test("never writes `status` on the request — the trigger does", async () => {
    const { client, inserts, updates } = fakeCaseDb(fixture());

    await createCaseDocumentVersion(ACTOR, CASE_A, input(), client);

    // `private.sync_document_request_status` writes it in the same statement, and
    // `guard_document_request_status` refuses a contradicting hand-written value
    // with a `23514`. A repository that also wrote it would be the second source of
    // truth spec §3 forbids.
    expect(updates.filter((u) => u.table === "case_document_requests")).toEqual([]);
    expect(inserts.every((i) => i.table !== "case_document_requests")).toBe(true);
  });

  test("REFUSES a storage_path that does not sit under this case's prefix", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    const result = await createCaseDocumentVersion(
      ACTOR,
      CASE_A,
      input({ storagePath: `case/${CASE_B}/${VERSION_ID}` }),
      client,
    );

    // The database CHECK is the floor and would raise `23514`; refusing here means
    // the caller learns it was a bad argument rather than reading a constraint
    // violation as a permission answer. Both layers, neither subsuming the other.
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(inserts.filter((i) => i.table === "case_document_versions")).toEqual([]);
  });

  test("REFUSES an owner-keyed vault path — a version is case-keyed or it is nothing", async () => {
    const { client, inserts } = fakeCaseDb(fixture());
    const result = await createCaseDocumentVersion(
      ACTOR,
      CASE_A,
      input({ storagePath: `${ACTOR}/passport/${VERSION_ID}.pdf` }),
      client,
    );
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(inserts.filter((i) => i.table === "case_document_versions")).toEqual([]);
  });

  test("accepts an UPPERCASE case id without writing a path the row can never match", async () => {
    // `z.uuid()` accepts `A1B2…` as readily as `a1b2…` and nothing upstream
    // normalises, while Postgres stores `uuid` lowercase. An uppercase id that
    // reached a raw interpolation would write bytes under `case/<UPPER>/…` while
    // the row beside them said `<lower>` — and the two would never meet again.
    const { client, inserts } = fakeCaseDb(fixture());

    const result = await createCaseDocumentVersion(
      ACTOR,
      CASE_A.toUpperCase(),
      input({ storagePath: `case/${CASE_A}/${VERSION_ID}` }),
      client,
    );

    expect(result.ok).toBe(true);
    const row = inserts.find((i) => i.table === "case_document_versions")?.row;
    expect(row?.storage_path).toBe(`case/${CASE_A}/${VERSION_ID}`);
  });

  test("reports a `42501` as DENIED, not as a generic failure", async () => {
    const { client } = fakeCaseDb(fixture(), {
      insertError: { case_document_versions: { code: "42501", message: "denied" } },
    });
    // "Ask someone" and "try again" are different instructions; collapsing them
    // sends the user to the wrong one.
    expect(await createCaseDocumentVersion(ACTOR, CASE_A, input(), client)).toEqual({
      ok: false,
      reason: "denied",
    });
  });

  test("reports any other insert error as a write failure, never as success", async () => {
    const { client } = fakeCaseDb(fixture(), {
      insertError: { case_document_versions: { code: "23514", message: "check violation" } },
    });
    expect(await createCaseDocumentVersion(ACTOR, CASE_A, input(), client)).toEqual({
      ok: false,
      reason: "write-failed",
    });
  });

  test("refuses a case that does not exist, and one with no organization", async () => {
    const unknown = fakeCaseDb({ cases: [], case_document_versions: [] });
    expect(await createCaseDocumentVersion(ACTOR, CASE_A, input(), unknown.client)).toEqual({
      ok: false,
      reason: "unknown-case",
    });

    const personal = fakeCaseDb({
      cases: [{ id: CASE_A, organization_id: null }],
      case_document_versions: [],
    });
    // A personal case carries no consultancy version at all: `case_org_id` is NULL
    // there and the policy's WITH CHECK admits only TRUE.
    expect(await createCaseDocumentVersion(ACTOR, CASE_A, input(), personal.client)).toEqual({
      ok: false,
      reason: "not-an-org-case",
    });
  });

  test("refuses blank identifiers without a query", async () => {
    const { client, queries } = fakeCaseDb(fixture());
    expect(await createCaseDocumentVersion("", CASE_A, input(), client)).toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(await createCaseDocumentVersion(ACTOR, CASE_A, input({ requestId: "" }), client)).toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(queries).toHaveLength(0);
  });
});

describe("createCaseDocumentReview", () => {
  test("writes the decision, the note and the actor's own provenance", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    const result = await createCaseDocumentReview(
      ACTOR,
      CASE_A,
      VERSION_ID,
      { decision: "rejected", note: "Page is cut off" },
      client,
    );

    expect(result.ok).toBe(true);
    const row = inserts.find((i) => i.table === "case_document_reviews")?.row;
    expect(row).toMatchObject({
      case_id: CASE_A,
      organization_id: ORG_A,
      version_id: VERSION_ID,
      decision: "rejected",
      note: "Page is cut off",
      reviewed_by: ACTOR,
    });
  });

  test("stores a blank note as NULL, never as an empty string", async () => {
    const { client, inserts } = fakeCaseDb(fixture());
    await createCaseDocumentReview(ACTOR, CASE_A, VERSION_ID, { decision: "accepted", note: "  " }, client);
    // "No reason given" is a real state; "" would be a third value that renders as
    // a reason the reviewer did not write.
    expect(inserts.find((i) => i.table === "case_document_reviews")?.row.note).toBeNull();
  });

  test("admits only `accepted` and `rejected`, and never reaches the database otherwise", async () => {
    const { client, inserts } = fakeCaseDb(fixture());
    const result = await createCaseDocumentReview(
      ACTOR,
      CASE_A,
      VERSION_ID,
      { decision: "maybe", note: null },
      client,
    );
    // The guard between user input and the check constraint: a value the constraint
    // cannot admit is refused here rather than sent as a write that can only `23514`.
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(inserts.filter((i) => i.table === "case_document_reviews")).toEqual([]);
  });

  test("never writes `status` on the request — the trigger does", async () => {
    const { client, updates } = fakeCaseDb(fixture());
    await createCaseDocumentReview(ACTOR, CASE_A, VERSION_ID, { decision: "accepted", note: null }, client);
    expect(updates.filter((u) => u.table === "case_document_requests")).toEqual([]);
  });

  test("reports a `42501` as DENIED — this is how RLS refuses a student's review", async () => {
    const { client } = fakeCaseDb(fixture(), {
      insertError: { case_document_reviews: { code: "42501", message: "denied" } },
    });
    expect(
      await createCaseDocumentReview(ACTOR, CASE_A, VERSION_ID, { decision: "accepted", note: null }, client),
    ).toEqual({ ok: false, reason: "denied" });
  });
});

describe("getCaseDocumentVersion — the download route's read", () => {
  test("resolves a version by id AND by case, never by id alone", async () => {
    const { client, queries } = fakeCaseDb(
      fixture({ case_document_versions: [versionRow()] }),
    );

    const result = await getCaseDocumentVersion(VERSION_ID, CASE_A, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.storagePath).toBe(PATH);
    // BOTH filters. The caller authorized ONE case; without the `case_id`
    // predicate a version id belonging to a different case the actor happens to
    // staff would be resolved under this case's authorization, and its path handed
    // to the mint. Spec F-8's class, one table further down.
    expect(
      sawQuery(queries, "case_document_versions", [
        ["id", VERSION_ID],
        ["case_id", CASE_A],
      ]),
    ).toBe(true);
  });

  test("reports a version on ANOTHER case as absent, not as an error", async () => {
    const { client } = fakeCaseDb(
      fixture({ case_document_versions: [versionRow({ case_id: CASE_B })] }),
    );
    const result = await getCaseDocumentVersion(VERSION_ID, CASE_A, client);
    expect(result).toEqual({ ok: true, data: null });
  });

  test("keeps a FAILED lookup apart from an absent row", async () => {
    const { client } = fakeCaseDb(fixture(), {
      errorOn: { case_document_versions: { message: "boom" } },
    });
    // 404 and 500 are different sentences to the user, and only one of them is a
    // statement about the version existing.
    expect(await getCaseDocumentVersion(VERSION_ID, CASE_A, client)).toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });
});

describe("the append-only fence, on the module's own surface", () => {
  test("exports no verb that would need an UPDATE or DELETE grant", async () => {
    const repo = await import("@/lib/cases/document-collaboration-repo");
    const verbs = Object.keys(repo).filter((k) => typeof (repo as Record<string, unknown>)[k] === "function");
    // MV-185 grants neither on either table and asserts both absences at apply
    // time. A helper named `update…`/`delete…` could only ever raise `42501`, and
    // the cheapest way to ship one is to add it before anything calls it.
    expect(verbs.filter((v) => /^(update|delete|remove|edit)/i.test(v))).toEqual([]);
    // Non-vacuity: a broken import returning {} would make the filter above empty
    // for the wrong reason.
    expect(verbs.length).toBeGreaterThan(4);
  });
});
