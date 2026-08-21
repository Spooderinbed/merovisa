import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * MV-189 — the five document-access routes emit their audit event, and FAIL CLOSED when
 * they cannot (spec §8.2, D12; §8.4, D14; §8.5, D15).
 *
 * ## The property, stated once
 *
 * **No route returns a 2xx response without its audit row committed.** That is the
 * invariant the plan asks for — an authorized sensitive read and its audit row "cannot be
 * separated" (line 504) — reduced to something a test can hold.
 *
 * On the two SIGNED-URL routes it is strictly stronger, and the difference is the whole
 * reason those two audit BEFORE they mint: a signed URL is an unauthenticated bearer of
 * the bytes the moment it exists, so "audit failed, but the URL is already out" is not a
 * recoverable state. Those tests therefore assert BOTH the 500 AND that
 * `mintCaseScopedDownloadUrl` was never called. A `.catch(() => {})` around the audit
 * write passes the status assertion and fails the mint assertion — which is exactly the
 * mutant this file exists to kill.
 *
 * ## One `it(...)` per sentence
 *
 * MISTAKES.md, Testing: three mutants naming one bundled test cannot tell "the conjunct is
 * load-bearing" from "something in that test is". So the success shape, the actor, the
 * organization and the PII omission are four separate assertions per route, not one
 * `toHaveBeenCalledWith` covering all of them.
 */

const {
  getUser,
  from,
  adminFrom,
  storageUpload,
  storageRemove,
  createSignedUrl,
  upsertDocument,
  getDocumentByKindForCase,
  listDocumentsByKindsForCase,
  patchProfileSectionForCase,
  invalidatePlan,
  checkRateLimit,
  resolvePersonalCaseId,
  checkCasePermission,
  getCaseDocumentRequest,
  getCaseDocumentVersion,
  createCaseDocumentVersion,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  adminFrom: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  createSignedUrl: vi.fn(),
  upsertDocument: vi.fn(),
  getDocumentByKindForCase: vi.fn(),
  listDocumentsByKindsForCase: vi.fn(),
  patchProfileSectionForCase: vi.fn(),
  invalidatePlan: vi.fn(),
  checkRateLimit: vi.fn(),
  resolvePersonalCaseId: vi.fn(),
  checkCasePermission: vi.fn(),
  getCaseDocumentRequest: vi.fn(),
  getCaseDocumentVersion: vi.fn(),
  createCaseDocumentVersion: vi.fn(),
}));

/**
 * ORDER MARKERS RECORD A MICROTASK LATE, NOT AT INVOCATION.
 *
 * MISTAKES.md: MV-190's "authorizes before it reaches Storage" stayed green against a
 * mutant that STARTED the check and awaited it after minting, because the mock pushed its
 * marker when it was called. Every double here awaits a microtask before recording, so a
 * parallelised implementation reads red rather than green.
 */
const { calls, writeAuditEvent, mint } = vi.hoisted(() => {
  const calls: string[] = [];
  const writeAuditEvent = vi.fn(async (_db: unknown, _input: unknown) => {
    await Promise.resolve();
    calls.push("audit");
  });
  const mint = vi.fn(async (_params: unknown) => {
    await Promise.resolve();
    calls.push("mint");
    return { ok: true as const, url: "https://signed.example/object" };
  });
  return { calls, writeAuditEvent, mint };
});

const storageFrom = vi.fn(() => ({
  upload: storageUpload,
  remove: storageRemove,
  createSignedUrl,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, from }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: adminFrom, storage: { from: storageFrom } }),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));
vi.mock("@/lib/documents/repo", () => ({
  upsertDocument,
  getDocumentByKindForCase,
  listDocumentsByKindsForCase,
}));
vi.mock("@/lib/profiles/repo", () => ({ patchProfileSectionForCase }));
vi.mock("@/lib/plan/invalidate", () => ({ invalidatePlan }));
vi.mock("@/lib/rate-limit/upstash", () => ({ checkRateLimit }));
vi.mock("@/lib/cases/document-requests-repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/document-requests-repo")>(
    "@/lib/cases/document-requests-repo",
  );
  return { ...actual, getCaseDocumentRequest };
});
vi.mock("@/lib/cases/document-collaboration-repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/document-collaboration-repo")>(
    "@/lib/cases/document-collaboration-repo",
  );
  return { ...actual, getCaseDocumentVersion, createCaseDocumentVersion };
});
vi.mock("@/lib/documents/signed-download", async () => {
  const actual = await vi.importActual<typeof import("@/lib/documents/signed-download")>(
    "@/lib/documents/signed-download",
  );
  return { ...actual, mintCaseScopedDownloadUrl: mint };
});
// Spread the ACTUAL module so the action union and the allow-list stay real — only the
// write itself is doubled. Mocking the module wholesale would let a route emit an action
// the writer would reject and still pass.
vi.mock("@/lib/audit/write-audit-event", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit/write-audit-event")>(
    "@/lib/audit/write-audit-event",
  );
  return { ...actual, writeAuditEvent };
});

import { POST as uploadPost } from "@/app/api/documents/upload/route";
import { DELETE as documentDelete } from "@/app/api/documents/[id]/route";
import { GET as documentView } from "@/app/api/documents/[id]/view/route";
import { POST as versionPost } from "@/app/api/cases/[caseId]/document-requests/[requestId]/versions/route";
import { GET as downloadGet } from "@/app/api/cases/[caseId]/document-versions/[versionId]/download/route";

const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERSONAL = "11111111-1111-4111-8111-111111111111";
// HEX LETTERS, not an all-digit uuid — the fixture trap MISTAKES.md records twice.
const CASE_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const ORG_ID = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa";
const DOC_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";

/** A REAL filename of the shape D13 exists to keep out of the log. */
const PII_FILENAME = "Ram_Bahadur_passport_2026.pdf";

/** PNG magic bytes, and TWELVE of them — `verifyFileMagic` refuses anything under 12. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/**
 * `noUncheckedIndexedAccess` is on, so this throws rather than handing back `undefined` —
 * which matters: an `expect(auditArg().action).toBe(...)` against an uncalled mock would
 * otherwise fail with a confusing "cannot read property of undefined" instead of the
 * accurate "the route never audited".
 */
const auditArg = (): Record<string, unknown> => {
  const arg = writeAuditEvent.mock.calls[0]?.[1];
  if (arg === undefined) throw new Error("writeAuditEvent was never called");
  return arg as Record<string, unknown>;
};
const auditMeta = () => auditArg().metadata as Record<string, unknown>;

const uploadRequest = (caseId?: string): Request => {
  const form = new FormData();
  form.set("file", new File([PNG], PII_FILENAME, { type: "image/png" }));
  form.set("kind", "passport");
  if (caseId !== undefined) form.set("caseId", caseId);
  return { formData: async () => form } as unknown as Request;
};

const versionRequest = (): Request => {
  const form = new FormData();
  form.set("file", new File([PNG], PII_FILENAME, { type: "image/png" }));
  return { formData: async () => form } as unknown as Request;
};

const callDelete = () =>
  documentDelete(
    new Request(`http://localhost/api/documents/${DOC_ID}?caseId=${CASE_ID}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: DOC_ID }) },
  );

const callView = () =>
  documentView(new Request(`http://localhost/api/documents/${DOC_ID}/view?caseId=${CASE_ID}`), {
    params: Promise.resolve({ id: DOC_ID }),
  });

const callVersionPost = () =>
  versionPost(versionRequest(), {
    params: Promise.resolve({ caseId: CASE_ID, requestId: REQUEST_ID }),
  });

const callDownload = () =>
  downloadGet(
    new Request(`http://localhost/api/cases/${CASE_ID}/document-versions/${VERSION_ID}/download`),
    { params: Promise.resolve({ caseId: CASE_ID, versionId: VERSION_ID }) },
  );

const singleRow = (row: unknown) => ({
  select: () => ({
    eq: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  checkRateLimit.mockResolvedValue(true);
  resolvePersonalCaseId.mockResolvedValue(PERSONAL);
  // The context carries a REAL organization id — D15's whole subject. A `context: {}`
  // fixture would let "the org is written" pass while writing undefined.
  checkCasePermission.mockResolvedValue({
    decision: { allowed: true, requiredScope: "assigned", reason: null },
    context: { organizationId: ORG_ID },
  });

  from.mockReturnValue(
    singleRow({
      id: DOC_ID,
      kind: "passport",
      file_path: "owner/passport/a.png",
      original_name: PII_FILENAME,
    }),
  );
  adminFrom.mockReturnValue({
    delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
  });
  storageUpload.mockResolvedValue({ error: null });
  storageRemove.mockResolvedValue({ error: null });
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://signed.example/o" },
    error: null,
  });
  upsertDocument.mockResolvedValue(DOC_ID);
  getDocumentByKindForCase.mockResolvedValue(null);
  listDocumentsByKindsForCase.mockResolvedValue([]);
  getCaseDocumentRequest.mockResolvedValue({
    ok: true,
    data: { id: REQUEST_ID, caseId: CASE_ID, status: "outstanding", kind: "passport" },
  });
  getCaseDocumentVersion.mockResolvedValue({
    ok: true,
    data: {
      id: VERSION_ID,
      storagePath: `case/${CASE_ID}/${VERSION_ID}.pdf`,
      originalName: PII_FILENAME,
    },
  });
  createCaseDocumentVersion.mockResolvedValue({ ok: true, id: VERSION_ID });
  writeAuditEvent.mockImplementation(async () => {
    await Promise.resolve();
    calls.push("audit");
  });
});

/* ------------------------------------------------------------------ *
 * The two signed-URL routes — audit BEFORE the mint
 * ------------------------------------------------------------------ */

describe("GET /api/documents/[id]/view — document.viewed", () => {
  it("writes the audit row on a successful view", async () => {
    const res = await callView();
    expect(res.status).toBe(200);
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("names the action document.viewed", async () => {
    await callView();
    expect(auditArg().action).toBe("document.viewed");
  });

  it("AUDITS BEFORE IT MINTS — the URL must never exist without its row", async () => {
    await callView();
    expect(calls).toEqual(["audit", "mint"]);
  });

  it("returns 500 when the audit write fails", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));
    const res = await callView();
    expect(res.status).toBe(500);
  });

  it("NEVER MINTS when the audit write fails — the assertion a swallowed catch cannot pass", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));
    await callView();
    expect(mint).not.toHaveBeenCalled();
  });

  it("D14: records the authenticated human as the actor", async () => {
    await callView();
    expect(auditArg().actorUserId).toBe(ACTOR);
  });

  it("D15: records the case's organization", async () => {
    await callView();
    expect(auditArg().organizationId).toBe(ORG_ID);
  });

  it("D13: carries no filename in metadata, though the row it read has one", async () => {
    await callView();
    expect(JSON.stringify(auditMeta())).not.toContain("Ram_Bahadur");
  });
});

describe("GET /api/cases/[caseId]/document-versions/[versionId]/download — document.downloaded", () => {
  it("writes the audit row on a successful download", async () => {
    const res = await callDownload();
    expect(res.status).toBe(200);
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("names the action document.downloaded", async () => {
    await callDownload();
    expect(auditArg().action).toBe("document.downloaded");
  });

  it("AUDITS BEFORE IT MINTS", async () => {
    await callDownload();
    expect(calls).toEqual(["audit", "mint"]);
  });

  it("returns 500 when the audit write fails", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));
    const res = await callDownload();
    expect(res.status).toBe(500);
  });

  it("NEVER MINTS when the audit write fails", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));
    await callDownload();
    expect(mint).not.toHaveBeenCalled();
  });

  it("D14: records the authenticated human as the actor", async () => {
    await callDownload();
    expect(auditArg().actorUserId).toBe(ACTOR);
  });

  it("D15: records the case's organization", async () => {
    await callDownload();
    expect(auditArg().organizationId).toBe(ORG_ID);
  });

  it("D13: carries no filename, though the version row it resolved has one", async () => {
    await callDownload();
    expect(JSON.stringify(auditMeta())).not.toContain("Ram_Bahadur");
  });

  it("D13: carries no storage path either", async () => {
    await callDownload();
    expect(JSON.stringify(auditMeta())).not.toContain("case/");
  });
});

/* ------------------------------------------------------------------ *
 * The three mutations — audit AFTER the effect commits
 * ------------------------------------------------------------------ */

describe("POST /api/documents/upload — document.uploaded", () => {
  it("writes the audit row on a successful upload", async () => {
    const res = await uploadPost(uploadRequest(CASE_ID));
    expect(res.status).toBe(200);
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("names the action document.uploaded", async () => {
    await uploadPost(uploadRequest(CASE_ID));
    expect(auditArg().action).toBe("document.uploaded");
  });

  it("returns 500 when the audit write fails — no 2xx without a row", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));
    const res = await uploadPost(uploadRequest(CASE_ID));
    expect(res.status).toBe(500);
  });

  it("D14: records the authenticated human as the actor", async () => {
    await uploadPost(uploadRequest(CASE_ID));
    expect(auditArg().actorUserId).toBe(ACTOR);
  });

  it("D15: records the case's organization", async () => {
    await uploadPost(uploadRequest(CASE_ID));
    expect(auditArg().organizationId).toBe(ORG_ID);
  });

  it("D15: writes null — not undefined — for a personal case with no organization", async () => {
    checkCasePermission.mockResolvedValue({
      decision: { allowed: true, requiredScope: "owner", reason: null },
      context: { organizationId: null },
    });
    await uploadPost(uploadRequest());
    expect(auditArg().organizationId).toBeNull();
  });

  it("D13: carries no filename, though the uploaded file has a very identifying one", async () => {
    await uploadPost(uploadRequest(CASE_ID));
    expect(JSON.stringify(auditMeta())).not.toContain("Ram_Bahadur");
  });

  it("records the document kind and size, which are safe and are the point", async () => {
    await uploadPost(uploadRequest(CASE_ID));
    expect(auditMeta().kind).toBe("passport");
    expect(auditMeta().byte_size).toBe(PNG.byteLength);
  });
});

describe("DELETE /api/documents/[id] — document.deleted", () => {
  it("writes the audit row on a successful delete", async () => {
    const res = await callDelete();
    expect(res.status).toBe(200);
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("names the action document.deleted", async () => {
    await callDelete();
    expect(auditArg().action).toBe("document.deleted");
  });

  it("returns 500 when the audit write fails", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));
    const res = await callDelete();
    expect(res.status).toBe(500);
  });

  it("D14: records the authenticated human as the actor", async () => {
    await callDelete();
    expect(auditArg().actorUserId).toBe(ACTOR);
  });

  it("D15: records the case's organization", async () => {
    await callDelete();
    expect(auditArg().organizationId).toBe(ORG_ID);
  });

  it("D13: carries no filename, though the deleted row it read carried one", async () => {
    await callDelete();
    expect(JSON.stringify(auditMeta())).not.toContain("Ram_Bahadur");
  });
});

describe("POST /api/cases/[caseId]/document-requests/[requestId]/versions — document.version_uploaded", () => {
  it("writes the audit row on a successful version upload", async () => {
    const res = await callVersionPost();
    expect(res.status).toBe(201);
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("names the action document.version_uploaded", async () => {
    await callVersionPost();
    expect(auditArg().action).toBe("document.version_uploaded");
  });

  it("returns 500 instead of 201 when the audit write fails", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));
    const res = await callVersionPost();
    expect(res.status).toBe(500);
  });

  it("does NOT remove the uploaded object when only the audit failed — the row is valid", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));
    await callVersionPost();
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it("D14: records the authenticated human as the actor", async () => {
    await callVersionPost();
    expect(auditArg().actorUserId).toBe(ACTOR);
  });

  it("D15: records the case's organization", async () => {
    await callVersionPost();
    expect(auditArg().organizationId).toBe(ORG_ID);
  });

  it("D13: carries no filename, though it wrote sanitizeFilename(file.name) to the ROW", async () => {
    await callVersionPost();
    expect(JSON.stringify(auditMeta())).not.toContain("Ram_Bahadur");
  });

  it("ties the version to its request without naming either's free text", async () => {
    await callVersionPost();
    expect(auditMeta().request_id).toBe(REQUEST_ID);
  });

  /**
   * The version id is CLIENT-GENERATED by the route (MV-186 spec §6.2, D5: the bytes are
   * uploaded first under an id that names both, so a failed insert can retract the object).
   * So the audited id is the one the route minted, NOT the fixture's — asserting the
   * fixture constant here would have pinned the mock's return value instead of the row
   * that was actually written. What matters is that the two agree.
   */
  it("audits the version id it actually generated, and metadata agrees with entityId", async () => {
    await callVersionPost();
    expect(auditMeta().version_id).toBe(auditArg().entityId);
    expect(auditMeta().version_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

/* ------------------------------------------------------------------ *
 * The invariant, swept across all five
 * ------------------------------------------------------------------ */

describe("the D12 invariant — no 2xx without an audit row", () => {
  const ROUTES: ReadonlyArray<[string, () => Promise<Response>]> = [
    ["documents/upload", () => uploadPost(uploadRequest(CASE_ID))],
    ["documents/[id] DELETE", callDelete],
    ["documents/[id]/view", callView],
    ["cases/…/versions POST", callVersionPost],
    ["cases/…/download", callDownload],
  ];

  it.each(ROUTES)("%s returns 2xx and writes exactly one audit row", async (_name, call) => {
    const res = await call();
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
  });

  it.each(ROUTES)("%s returns a non-2xx when the audit write fails", async (_name, call) => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));
    const res = await call();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it.each(ROUTES)("%s audits with an action the writer would accept", async (_name, call) => {
    await call();
    const { DOCUMENT_AUDIT_ACTIONS } = await import("@/lib/audit/write-audit-event");
    expect(DOCUMENT_AUDIT_ACTIONS).toContain(auditArg().action as never);
  });

  it.each(ROUTES)("%s passes a uuid as entityId, never a filename", async (_name, call) => {
    await call();
    expect(auditArg().entityId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
