import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * MV-186 — the three collaboration routes, asserted where the ORDERING lives.
 *
 * Four properties, none of which a happy-path test can see:
 *
 * 1. **Authorize, then act.** Every denial asserts the route reached neither the
 *    repository nor Storage — the thing a "load it first, check it after" refactor
 *    breaks while every 201 stays green.
 * 2. **UPLOAD THE BYTES, THEN INSERT THE ROW.** Spec §6.2 (D5) rejected a trigger
 *    approach on exactly this: with a server-issued id the sequence must be
 *    insert → upload, and a failed upload strands a version row pointing at an
 *    object that does not exist, with no DELETE grant to retract it. The order is
 *    asserted directly, and a failed insert must REMOVE the object it named.
 * 3. **The write routes gate on `case.documents.request`, the download on
 *    `case.read`.** That difference is the card's headline made mechanical: the
 *    linked student holds the read claim and not the write one, so a review route
 *    gated on `case.read` would admit them and leave RLS as the only thing between
 *    a student and reviewing their own passport.
 * 4. **The case id comes from the PATH**, and a version/request id from another
 *    case is a 404 rather than a 42501 dressed up as a denial.
 *
 * `checkCasePermission` is mocked — it is proven against its own fixtures in
 * `tests/cases/require-permission.test.ts`. What is NOT mocked is WHICH permission
 * each route asks for.
 */

const { getUser, serverClient } = vi.hoisted(() => {
  const getUser = vi.fn();
  return { getUser, serverClient: { auth: { getUser }, from: vi.fn() } };
});
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => serverClient }));

const { checkCasePermission } = vi.hoisted(() => ({ checkCasePermission: vi.fn() }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

const { getCaseDocumentRequest } = vi.hoisted(() => ({ getCaseDocumentRequest: vi.fn() }));
vi.mock("@/lib/cases/document-requests-repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/document-requests-repo")>(
    "@/lib/cases/document-requests-repo",
  );
  return { ...actual, getCaseDocumentRequest };
});

const { createCaseDocumentVersion, createCaseDocumentReview, getCaseDocumentVersion } = vi.hoisted(
  () => ({
    createCaseDocumentVersion: vi.fn(),
    createCaseDocumentReview: vi.fn(),
    getCaseDocumentVersion: vi.fn(),
  }),
);
vi.mock("@/lib/cases/document-collaboration-repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/document-collaboration-repo")>(
    "@/lib/cases/document-collaboration-repo",
  );
  return { ...actual, createCaseDocumentVersion, createCaseDocumentReview, getCaseDocumentVersion };
});

/**
 * The Storage double records WHEN it was called, not merely THAT it was.
 *
 * MISTAKES.md: an ordering assertion built on a mock that records at INVOCATION
 * time cannot see a deferred `await` — MV-190's "authorizes before it reaches
 * Storage" stayed green against a mutant that started the permission check and
 * awaited it AFTER minting. So every double here awaits a microtask before it
 * pushes its marker, which makes a parallelised implementation red rather than
 * green.
 */
type StorageResult = { error: { message: string } | null };
type MintResult =
  | { ok: true; url: string }
  | { ok: false; kind: string; reason?: string | null };

const { calls, upload, remove, mint, createSupabaseAdminClient } = vi.hoisted(() => {
  const calls: string[] = [];
  const upload = vi.fn(
    async (_path: string, _body: unknown, _options?: unknown): Promise<StorageResult> => {
      await Promise.resolve();
      calls.push("upload");
      return { error: null };
    },
  );
  const remove = vi.fn(async (_paths: string[]): Promise<StorageResult> => {
    await Promise.resolve();
    calls.push("remove");
    return { error: null };
  });
  const mint = vi.fn(async (_params: unknown): Promise<MintResult> => {
    await Promise.resolve();
    calls.push("mint");
    return { ok: true, url: "https://signed.example/object" };
  });
  return {
    calls,
    upload,
    remove,
    mint,
    createSupabaseAdminClient: vi.fn(() => ({
      storage: { from: () => ({ upload, remove }) },
    })),
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/documents/signed-download", async () => {
  const actual = await vi.importActual<typeof import("@/lib/documents/signed-download")>(
    "@/lib/documents/signed-download",
  );
  return { ...actual, mintCaseScopedDownloadUrl: mint };
});

const { checkRateLimit } = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit/upstash", () => ({ checkRateLimit }));

// MV-189 — the audit write is DOUBLED here on purpose. Its own behaviour is proven in
// tests/audit/write-audit-event.test.ts, and the routes' fail-closed wiring in
// tests/api/document-access-audit.test.ts. This suite is about the three collaboration routes and their ORDERING, and the real
// writer would need an admin client with a working `.from("audit_events").insert()` that
// this fixture deliberately does not build. importActual is spread so the action union and
// the metadata allow-list stay REAL — only the write is stubbed.
const { writeAuditEvent } = vi.hoisted(() => ({ writeAuditEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/audit/write-audit-event", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit/write-audit-event")>(
    "@/lib/audit/write-audit-event",
  );
  return { ...actual, writeAuditEvent };
});

import { POST as versionPost } from "@/app/api/cases/[caseId]/document-requests/[requestId]/versions/route";
import { POST as reviewPost } from "@/app/api/cases/[caseId]/document-versions/[versionId]/reviews/route";
import { GET as downloadGet } from "@/app/api/cases/[caseId]/document-versions/[versionId]/download/route";

// HEX LETTERS, not an all-digit uuid. A digits-only fixture makes `.toUpperCase()` a NO-OP, so
// the canonicalisation test below passes against a route that interpolates the case id raw —
// measured here: the mutant that replaced `caseVersionObjectPath` with a template literal killed
// NOTHING until this constant grew letters. The same trap MV-190 recorded in MISTAKES.md.
const CASE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR = "99999999-9999-4999-8999-999999999999";

const allow = { decision: { allowed: true, requiredScope: "assigned", reason: null }, context: {} };
const denyFor = (reason: string) => ({
  decision: { allowed: false, requiredScope: null, reason },
  context: {},
});

/** `%PDF-1.4` — a real header, so `verifyFileMagic` passes on the happy path for real. */
// SIXTEEN bytes, not ten: `verifyFileMagic` opens with `if (buffer.length < 12) return false`,
// so a short fixture is refused for its LENGTH and can never exercise the signature check it was
// written for. Measured — the first draft of this file was 10 bytes and every upload 422'd.
const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x31,
]);
/** Long enough to reach the signature checks, and matching none of them. */
const NOT_PDF_BYTES = new Uint8Array([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
]);

/**
 * A `File` whose bytes actually survive `arrayBuffer()`.
 *
 * MEASURED: a jsdom `File` constructed from a `Uint8Array` hands back an EMPTY buffer, so the
 * route's magic-byte check saw nothing and refused every fixture with a 422. The sibling suite
 * (`tests/api/documents/upload.test.ts`) solves this by mocking `verifyFileMagic` outright —
 * which would make the spoofing test below a test of the mock rather than of the route. Defining
 * the accessor keeps `instanceof File` true (the route's own type guard) AND keeps the
 * magic-byte assertion real: the spoofing fixture below is refused by the actual check.
 */
function fileWithBytes(bytes: Uint8Array<ArrayBuffer>, name: string, type: string): File {
  const file = new File([bytes], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  Object.defineProperty(file, "size", { value: bytes.byteLength });
  return file;
}

function pdfFile(name = "passport.pdf"): File {
  return fileWithBytes(PDF_BYTES, name, "application/pdf");
}

/**
 * jsdom/undici cannot round-trip a MULTIPART Request body — measured here, and the same reason
 * `tests/api/documents/upload.test.ts` stubs it. So `formData()` is stubbed directly rather
 * than relying on the runtime to parse a body it will not.
 */
function uploadRequest(file: File | null = pdfFile()): Request {
  const form = new FormData();
  if (file) form.set("file", file);
  return { formData: async () => form } as unknown as Request;
}

/** A request whose multipart body is unparseable — the 400 branch. */
function brokenUploadRequest(): Request {
  return {
    formData: async () => {
      throw new Error("unparseable multipart body");
    },
  } as unknown as Request;
}

const callVersion = (caseId = CASE_ID, requestId = REQUEST_ID, req = uploadRequest()) =>
  versionPost(req, { params: Promise.resolve({ caseId, requestId }) });

const callReview = (body: unknown, caseId = CASE_ID, versionId = VERSION_ID) =>
  reviewPost(
    new Request("http://localhost/api/cases/x/document-versions/y/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ caseId, versionId }) },
  );

const callDownload = (caseId = CASE_ID, versionId = VERSION_ID) =>
  downloadGet(new Request("http://localhost/api/cases/x/document-versions/y/download"), {
    params: Promise.resolve({ caseId, versionId }) },
  );

const versionRow = {
  id: VERSION_ID,
  requestId: REQUEST_ID,
  storagePath: `case/${CASE_ID}/${VERSION_ID}`,
  fileSize: 10,
  originalName: "passport.pdf",
  contentType: "application/pdf",
  createdAt: "2026-08-20T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  checkCasePermission.mockImplementation(async () => {
    await Promise.resolve();
    calls.push("check");
    return allow;
  });
  checkRateLimit.mockResolvedValue(true);
  getCaseDocumentRequest.mockResolvedValue({
    ok: true,
    data: { id: REQUEST_ID, status: "outstanding", title: "Passport bio page" },
  });
  createCaseDocumentVersion.mockResolvedValue({ ok: true, id: VERSION_ID });
  createCaseDocumentReview.mockResolvedValue({ ok: true, id: "rev-1" });
  getCaseDocumentVersion.mockResolvedValue({ ok: true, data: versionRow });
  upload.mockImplementation(async () => {
    await Promise.resolve();
    calls.push("upload");
    return { error: null };
  });
  createCaseDocumentVersion.mockImplementation(async () => {
    await Promise.resolve();
    calls.push("insert");
    return { ok: true, id: VERSION_ID };
  });
});

describe("POST versions — the upload", () => {
  it("records the version and returns 201", async () => {
    const res = await callVersion();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: VERSION_ID });
  });

  it("gates on case.documents.request, NOT on case.read", async () => {
    await callVersion();
    // The linked student holds `case.read` at `linked` and this claim not at all —
    // exactly `private.can_staff_case`. Gating on the read claim would ship the
    // wrong 403/201 to every caller.
    expect(checkCasePermission).toHaveBeenCalledWith(
      ACTOR,
      CASE_ID,
      "case.documents.request",
      expect.anything(),
    );
  });

  it("uploads the BYTES BEFORE it inserts the row", async () => {
    await callVersion();
    // Spec §6.2 (D5). The reverse order strands a version row pointing at an object
    // that does not exist, and there is NO DELETE GRANT to retract it — the request
    // would sit `outstanding` behind a file nobody can open.
    expect(calls.indexOf("upload")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("insert")).toBeGreaterThan(calls.indexOf("upload"));
  });

  it("waits for the case DECISION before it reaches Storage", async () => {
    await callVersion();
    // Asserted on when the check RESOLVED, not when it was invoked: a mock that
    // records at invocation time cannot see a parallelising refactor (MISTAKES.md,
    // measured on MV-190).
    expect(calls.indexOf("check")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("upload")).toBeGreaterThan(calls.indexOf("check"));
  });

  it("hands the repository a CLIENT-GENERATED id that matches the object key", async () => {
    await callVersion();
    const [, caseArg, input] = createCaseDocumentVersion.mock.calls[0]!;
    expect(caseArg).toBe(CASE_ID);
    // One id names both the row and the bytes, which is what makes upload-then-insert
    // possible at all. MV-190 granted `insert (id)` for exactly this.
    expect(input.storagePath).toBe(`case/${CASE_ID}/${input.id}`);
    expect(upload).toHaveBeenCalledWith(input.storagePath, expect.anything(), expect.anything());
  });

  it("writes an object key under the LOWERCASE case id even when the path segment shouts", async () => {
    // `malformedPathId` uses `z.uuid()`, which accepts `A1B2…`; Postgres stores
    // `uuid` lowercase. A raw interpolation would put the bytes under
    // `case/<UPPER>/…` beside a row saying `<lower>` and the two would never meet.
    await callVersion(CASE_ID.toUpperCase());
    const key = upload.mock.calls[0]![0];
    expect(key.startsWith(`case/${CASE_ID}/`)).toBe(true);
    expect(key).not.toMatch(/[A-Z]/);
  });

  it("REMOVES the object it just wrote when the row insert fails", async () => {
    createCaseDocumentVersion.mockImplementation(async () => {
      await Promise.resolve();
      calls.push("insert");
      return { ok: false, reason: "write-failed" };
    });

    const res = await callVersion();

    expect(res.status).toBe(500);
    // The cheap half of the trade the ordering chose: an orphan object references
    // nothing, but leaving it deliberately is different from leaving it by accident.
    //
    // Asserted against the key the UPLOAD used, not against a constant: the version id is
    // generated inside the route, and a test naming its own uuid would pass while the route
    // removed a DIFFERENT object — leaking the real one and deleting nothing that existed.
    const uploadedKey = upload.mock.calls[0]![0];
    expect(remove).toHaveBeenCalledWith([uploadedKey]);
    expect(uploadedKey.startsWith(`case/${CASE_ID}/`)).toBe(true);
    // And it happened AFTER the failed insert, not speculatively before it.
    expect(calls.indexOf("remove")).toBeGreaterThan(calls.indexOf("insert"));
  });

  it("never writes case_document_requests.status — the trigger does", async () => {
    await callVersion();
    // `private.sync_document_request_status` fires inside the insert, and
    // `guard_document_request_status` refuses a contradicting hand-written value
    // with a `23514`.
    expect(serverClient.from).not.toHaveBeenCalled();
  });

  describe("refusals", () => {
    it("401s with no session, before any Storage or repository call", async () => {
      getUser.mockResolvedValue({ data: { user: null } });
      const res = await callVersion();
      expect(res.status).toBe(401);
      expect(upload).not.toHaveBeenCalled();
      expect(createCaseDocumentVersion).not.toHaveBeenCalled();
    });

    it("403s a denied case and uploads NOTHING", async () => {
      checkCasePermission.mockResolvedValue(denyFor("not-assigned"));
      const res = await callVersion();
      expect(res.status).toBe(403);
      expect(upload).not.toHaveBeenCalled();
      expect(createCaseDocumentVersion).not.toHaveBeenCalled();
    });

    it("400s a malformed case id before a client exists", async () => {
      const res = await callVersion("not-a-uuid");
      expect(res.status).toBe(400);
      expect(checkCasePermission).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    });

    it("400s a malformed REQUEST id too", async () => {
      const res = await callVersion(CASE_ID, "not-a-uuid");
      expect(res.status).toBe(400);
      expect(checkCasePermission).not.toHaveBeenCalled();
    });

    it("404s a request that belongs to another case, and uploads nothing", async () => {
      getCaseDocumentRequest.mockResolvedValue({ ok: true, data: null });
      const res = await callVersion();
      // NOT a 403: the policy's parentage conjunct would refuse this as a `42501`,
      // which reads as "you may not do this" when the truth is "there is no such
      // request here".
      expect(res.status).toBe(404);
      expect(upload).not.toHaveBeenCalled();
    });

    it("500s — never 404 — when the request lookup FAILED", async () => {
      getCaseDocumentRequest.mockResolvedValue({ ok: false, reason: "lookup-failed" });
      const res = await callVersion();
      expect(res.status).toBe(500);
      expect(upload).not.toHaveBeenCalled();
    });

    it("422s a file whose declared type is not allowed", async () => {
      const res = await callVersion(
        CASE_ID,
        REQUEST_ID,
        uploadRequest(fileWithBytes(PDF_BYTES, "x.exe", "application/x-msdownload")),
      );
      expect(res.status).toBe(422);
      expect(upload).not.toHaveBeenCalled();
    });

    it("422s a file whose BYTES do not match its declared type, before anything is written", async () => {
      const res = await callVersion(
        CASE_ID,
        REQUEST_ID,
        uploadRequest(fileWithBytes(NOT_PDF_BYTES, "fake.pdf", "application/pdf")),
      );
      // MIME spoofing. The magic-byte check runs before the upload, so a spoofed
      // file leaves no object behind.
      expect(res.status).toBe(422);
      expect(upload).not.toHaveBeenCalled();
    });

    it("400s an unparseable multipart body, and uploads nothing", async () => {
      const res = await callVersion(CASE_ID, REQUEST_ID, brokenUploadRequest());
      // A body we could not read is a MALFORMED REQUEST, not a validation failure about a file
      // we did read and disliked — and certainly not a 500, which would blame our own side for
      // a request that never arrived intact.
      expect(res.status).toBe(400);
      expect(upload).not.toHaveBeenCalled();
      expect(createCaseDocumentVersion).not.toHaveBeenCalled();
    });

    it("422s a missing file", async () => {
      const res = await callVersion(CASE_ID, REQUEST_ID, uploadRequest(null));
      expect(res.status).toBe(422);
      expect(upload).not.toHaveBeenCalled();
    });

    it("429s over the rate limit, before the case is even checked", async () => {
      checkRateLimit.mockResolvedValue(false);
      const res = await callVersion();
      expect(res.status).toBe(429);
      expect(upload).not.toHaveBeenCalled();
    });

    it("500s and does NOT insert a row when the Storage upload fails", async () => {
      upload.mockResolvedValue({ error: { message: "boom" } });
      const res = await callVersion();
      expect(res.status).toBe(500);
      // The whole point of the ordering: a failed upload writes no row at all.
      expect(createCaseDocumentVersion).not.toHaveBeenCalled();
    });
  });
});

describe("POST reviews — the judgement", () => {
  it("records an acceptance and returns 201", async () => {
    const res = await callReview({ decision: "accepted" });
    expect(res.status).toBe(201);
    expect(createCaseDocumentReview).toHaveBeenCalledWith(
      ACTOR,
      CASE_ID,
      VERSION_ID,
      { decision: "accepted", note: null },
      expect.anything(),
    );
  });

  it("carries the rejection NOTE through to the repository", async () => {
    await callReview({ decision: "rejected", note: "Page is cut off" });
    expect(createCaseDocumentReview).toHaveBeenCalledWith(
      ACTOR,
      CASE_ID,
      VERSION_ID,
      { decision: "rejected", note: "Page is cut off" },
      expect.anything(),
    );
  });

  it("gates on case.documents.request — a linked student must not review their own file", async () => {
    await callReview({ decision: "accepted" });
    // THE CARD'S HEADLINE. `can_staff_case` says so at the database; this claim is
    // its counterpart in the matrix, and gating on `case.read` would admit them here
    // and leave RLS as the only thing standing between a student and their own file.
    expect(checkCasePermission).toHaveBeenCalledWith(
      ACTOR,
      CASE_ID,
      "case.documents.request",
      expect.anything(),
    );
  });

  it("403s a denied case and writes nothing", async () => {
    checkCasePermission.mockResolvedValue(denyFor("not-assigned"));
    const res = await callReview({ decision: "accepted" });
    expect(res.status).toBe(403);
    expect(createCaseDocumentReview).not.toHaveBeenCalled();
  });

  it("422s a decision the check constraint could not admit", async () => {
    const res = await callReview({ decision: "pending" });
    // No `pending`: "nobody has decided yet" is the ABSENCE of a row. A route that
    // forwarded an arbitrary decision would be a general write surface onto a column
    // whose grant exists for exactly two values.
    expect(res.status).toBe(422);
    expect(createCaseDocumentReview).not.toHaveBeenCalled();
  });

  it("422s an unknown key — the body is strict, so nothing is silently ignored", async () => {
    const res = await callReview({ decision: "accepted", status: "resolved" });
    // `status` is emphatically not a field this body has: the request's status is
    // the trigger's to write.
    expect(res.status).toBe(422);
    expect(createCaseDocumentReview).not.toHaveBeenCalled();
  });

  it("404s a version that belongs to another case", async () => {
    getCaseDocumentVersion.mockResolvedValue({ ok: true, data: null });
    const res = await callReview({ decision: "accepted" });
    expect(res.status).toBe(404);
    expect(createCaseDocumentReview).not.toHaveBeenCalled();
  });

  it("500s — never 404 — when the version lookup FAILED", async () => {
    getCaseDocumentVersion.mockResolvedValue({ ok: false, reason: "lookup-failed" });
    const res = await callReview({ decision: "accepted" });
    expect(res.status).toBe(500);
    expect(createCaseDocumentReview).not.toHaveBeenCalled();
  });

  it("reads the version by BOTH the version id and the case id", async () => {
    await callReview({ decision: "accepted" });
    expect(getCaseDocumentVersion).toHaveBeenCalledWith(VERSION_ID, CASE_ID, expect.anything());
  });

  it("400s a malformed id before a client exists", async () => {
    expect((await callReview({ decision: "accepted" }, "nope")).status).toBe(400);
    expect((await callReview({ decision: "accepted" }, CASE_ID, "nope")).status).toBe(400);
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("403s a repository denial — this is how RLS refuses a student who reached the route", async () => {
    createCaseDocumentReview.mockResolvedValue({ ok: false, reason: "denied" });
    expect((await callReview({ decision: "accepted" })).status).toBe(403);
  });

  it("keeps a write failure apart from a denial", async () => {
    createCaseDocumentReview.mockResolvedValue({ ok: false, reason: "write-failed" });
    // "Ask someone" and "try again" are different instructions.
    expect((await callReview({ decision: "accepted" })).status).toBe(500);
  });
});

describe("GET download — the way to the bytes", () => {
  it("returns the signed url", async () => {
    const res = await callDownload();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://signed.example/object" });
  });

  it("gates on case.read, so the LINKED STUDENT can open the file on their own case", async () => {
    await callDownload();
    // Deliberately the READ claim and not the write one (spec §7.2 D7). The student
    // may see the file and the rejection note; they may not upload or judge.
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, CASE_ID, "case.read", expect.anything());
  });

  it("waits for the case DECISION before it mints", async () => {
    await callDownload();
    expect(calls.indexOf("check")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("mint")).toBeGreaterThan(calls.indexOf("check"));
  });

  it("hands the mint the stored path and the case, and never a pre-made url", async () => {
    await callDownload();
    expect(mint).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ACTOR,
        caseId: CASE_ID,
        storagePath: versionRow.storagePath,
      }),
    );
    // No "already authorized" flag exists to pass — the helper re-checks by
    // construction, which is the property MV-190 built it for.
    expect(mint.mock.calls[0]![0]).not.toHaveProperty("alreadyAuthorized");
  });

  it("403s a denied case and NEVER mints", async () => {
    checkCasePermission.mockResolvedValue(denyFor("not-assigned"));
    const res = await callDownload();
    expect(res.status).toBe(403);
    // A signed URL is an unauthenticated bearer of the bytes the instant it exists,
    // so the assertion is on the MINT CALL rather than on a fetch returning 404.
    expect(mint).not.toHaveBeenCalled();
  });

  it("404s a version on another case, without minting", async () => {
    getCaseDocumentVersion.mockResolvedValue({ ok: true, data: null });
    const res = await callDownload();
    expect(res.status).toBe(404);
    expect(mint).not.toHaveBeenCalled();
  });

  it("500s a failed lookup rather than reporting the file absent", async () => {
    getCaseDocumentVersion.mockResolvedValue({ ok: false, reason: "lookup-failed" });
    expect((await callDownload()).status).toBe(500);
    expect(mint).not.toHaveBeenCalled();
  });

  it("400s a malformed id before a client exists", async () => {
    expect((await callDownload("nope")).status).toBe(400);
    expect((await callDownload(CASE_ID, "nope")).status).toBe(400);
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("does not leak the storage path to the client on a mint failure", async () => {
    mint.mockResolvedValue({ ok: false, kind: "mint-failed" });
    const res = await callDownload();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("case/");
  });

  it("reports a mint-time DENIAL as a denial, with its reason preserved", async () => {
    mint.mockResolvedValue({ ok: false, kind: "denied", reason: "not-assigned" });
    expect((await callDownload()).status).toBe(403);
  });
});
