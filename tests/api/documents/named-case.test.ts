import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * MV-190 — the three `documents` routes accept a NAMED case id and authorize it.
 *
 * ## The correction this suite exists to carry
 *
 * The plan called this work "case-scoping the three existing routes". **They were already
 * case-scoped** — MV-157 §G authorizes the case before any Storage call and filters every row by
 * `case_id`. The real gap was narrower and is the standing **F-8** finding: all three resolved
 * *the actor's own* case through `resolvePersonalCaseId`, so a counsellor could not name a
 * student's case and therefore could not act on one at all.
 *
 * ## Why a 200 is not evidence, and what is asserted instead
 *
 * RLS cannot catch a wrong-case write here. A counsellor legitimately may reach their own case, so
 * a route that ignored the parameter and wrote to the counsellor's own vault returns exactly the
 * same 200 as one that honoured it. There is no status to assert on. What CAN be asserted at this
 * layer is the ARGUMENT — the case id handed to the permission layer and to Storage — and the
 * NEGATIVE that no fallback ran.
 *
 * These three are absent from `tests/api/case-scoped-routes.test.ts`'s `ROUTES` table only because
 * that table's shape is `call({ ...body, caseId })` and none of these has a JSON body: `upload` is
 * multipart, `[id]` is a DELETE and `[id]/view` is a GET. That suite's sweep still requires all
 * three to be parameterized, and requires this file's existence to be the reason they are exempt.
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
}));

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
// `resolveTargetCase` and `targetCaseResponse` are REAL. Mocking them would move the property
// under test into a stub and leave the routes free to do anything.
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

import { POST as uploadPost } from "@/app/api/documents/upload/route";
import { DELETE as documentDelete } from "@/app/api/documents/[id]/route";
import { GET as documentView } from "@/app/api/documents/[id]/view/route";

const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERSONAL = "11111111-1111-4111-8111-111111111111";
const REQUESTED = "22222222-2222-4222-8222-222222222222";
const DOC_ID = "33333333-3333-4333-8333-333333333333";

/** A PNG magic-byte header, so `verifyFileMagic` passes without stubbing it. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/**
 * jsdom/undici cannot round-trip a multipart Request body, so `formData()` is stubbed directly
 * rather than parsed by the runtime — the same workaround `tests/api/documents/upload.test.ts` and
 * `tests/api/case-denial.test.ts` already use. The real magic-byte check runs: `PNG` above is a
 * genuine PNG signature, so nothing about validation is mocked away.
 */
const uploadRequest = (caseId?: string): Request => {
  const form = new FormData();
  form.set("file", new File([PNG], "passport.png", { type: "image/png" }));
  form.set("kind", "passport");
  if (caseId !== undefined) form.set("caseId", caseId);
  return { formData: async () => form } as unknown as Request;
};

const deleteRequest = (caseId?: string) =>
  documentDelete(
    new Request(
      caseId === undefined
        ? `http://localhost/api/documents/${DOC_ID}`
        : `http://localhost/api/documents/${DOC_ID}?caseId=${encodeURIComponent(caseId)}`,
      { method: "DELETE" },
    ),
    { params: Promise.resolve({ id: DOC_ID }) },
  );

const viewRequest = (caseId?: string) =>
  documentView(
    new Request(
      caseId === undefined
        ? `http://localhost/api/documents/${DOC_ID}/view`
        : `http://localhost/api/documents/${DOC_ID}/view?caseId=${encodeURIComponent(caseId)}`,
    ),
    { params: Promise.resolve({ id: DOC_ID }) },
  );

/** The `documents` single-row read both the delete and the view routes issue. */
const singleRow = (row: unknown) => ({
  select: () => ({
    eq: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  checkRateLimit.mockResolvedValue(true);
  resolvePersonalCaseId.mockResolvedValue(PERSONAL);
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });

  from.mockReturnValue(singleRow({ id: DOC_ID, kind: "passport", file_path: "owner/passport/a.png" }));
  adminFrom.mockReturnValue({ delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) });
  storageUpload.mockResolvedValue({ error: null });
  storageRemove.mockResolvedValue({ error: null });
  createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/o" }, error: null });
  upsertDocument.mockResolvedValue(DOC_ID);
  getDocumentByKindForCase.mockResolvedValue(null);
  listDocumentsByKindsForCase.mockResolvedValue([]);
});

describe("POST /api/documents/upload", () => {
  it("authorizes the REQUESTED case and never consults the actor's own", async () => {
    const res = await uploadPost(uploadRequest(REQUESTED));

    expect(res.status).toBe(200);
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, REQUESTED, "case.update", expect.anything());
    // The negative is half the property. A route that authorized the requested case and then
    // wrote to the personal one returns this same 200.
    expect(resolvePersonalCaseId).not.toHaveBeenCalled();
    expect(upsertDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ caseId: REQUESTED }),
    );
  });

  it("puts a NAMED case's object under the case/ prefix, not in the actor's uid folder", async () => {
    await uploadPost(uploadRequest(REQUESTED));

    const [path] = storageUpload.mock.calls[0]!;
    // An owner-keyed object here would sit in the COUNSELLOR's folder, where the live
    // `(storage.foldername(name))[1] = auth.uid()::text` policy lets them read it directly and
    // forever — outliving the assignment that justified the upload.
    expect(path).toMatch(new RegExp(`^case/${REQUESTED}/[0-9a-f-]{36}\\.png$`));
    expect(path).not.toContain(ACTOR);
  });

  it("refuses a case the actor cannot reach, and writes nothing", async () => {
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, reason: "not-assigned" },
      context: {},
    });

    const res = await uploadPost(uploadRequest(REQUESTED));

    expect(res.status).toBe(403);
    expect(storageFrom).not.toHaveBeenCalled();
    expect(upsertDocument).not.toHaveBeenCalled();
  });

  it("400s on a malformed case id rather than falling back to the actor's own", async () => {
    const res = await uploadPost(uploadRequest("not-a-uuid"));

    expect(res.status).toBe(400);
    // THE FALLBACK IS THE BUG. Treating a badly-named case as absent is how a mishandled id
    // silently lands a student's passport on the counsellor's own vault.
    expect(resolvePersonalCaseId).not.toHaveBeenCalled();
    expect(checkCasePermission).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("UNCHANGED with no case named: the actor's own case, and an owner-keyed path", async () => {
    const res = await uploadPost(uploadRequest());

    expect(res.status).toBe(200);
    expect(resolvePersonalCaseId).toHaveBeenCalledWith(ACTOR, expect.anything());
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, PERSONAL, "case.update", expect.anything());
    // Criterion 6. An owner-keyed object is, by construction, only ever written for the actor's
    // own personal case — because the ONLY branch that produces one is the branch with no case id.
    const [path] = storageUpload.mock.calls[0]!;
    expect(path).toMatch(new RegExp(`^${ACTOR}/passport/[0-9a-f-]{36}\\.png$`));
  });
});

describe("DELETE /api/documents/[id]", () => {
  it("authorizes the REQUESTED case and never consults the actor's own", async () => {
    const res = await deleteRequest(REQUESTED);

    expect(res.status).toBe(200);
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, REQUESTED, "case.update", expect.anything());
    expect(resolvePersonalCaseId).not.toHaveBeenCalled();
  });

  it("refuses a case the actor cannot reach, and touches no Storage", async () => {
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, reason: "not-assigned" },
      context: {},
    });

    const res = await deleteRequest(REQUESTED);

    expect(res.status).toBe(403);
    // Ordering, not just outcome: a route that deleted the object and then asked whether it was
    // allowed to returns the same 403 with the bytes already gone.
    expect(storageFrom).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("400s on a malformed case id rather than falling back to the actor's own", async () => {
    const res = await deleteRequest("not-a-uuid");

    expect(res.status).toBe(400);
    expect(resolvePersonalCaseId).not.toHaveBeenCalled();
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("UNCHANGED with no case named: the actor's own case", async () => {
    const res = await deleteRequest();

    expect(res.status).toBe(200);
    expect(resolvePersonalCaseId).toHaveBeenCalledWith(ACTOR, expect.anything());
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, PERSONAL, "case.update", expect.anything());
  });
});

describe("GET /api/documents/[id]/view", () => {
  it("authorizes the REQUESTED case and never consults the actor's own", async () => {
    const res = await viewRequest(REQUESTED);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://signed.example/o" });
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, REQUESTED, "case.read", expect.anything());
    expect(resolvePersonalCaseId).not.toHaveBeenCalled();
  });

  it("refuses a case the actor cannot reach, and mints NOTHING", async () => {
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, reason: "not-assigned" },
      context: {},
    });

    const res = await viewRequest(REQUESTED);

    expect(res.status).toBe(403);
    // Criterion 2, at the route. A signed URL is an unauthenticated bearer of the bytes the
    // instant it exists, so "minted and then discarded" is not a refusal at all.
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("mints with the short TTL, as a number", async () => {
    await viewRequest(REQUESTED);
    expect(createSignedUrl).toHaveBeenCalledWith("owner/passport/a.png", 60);
  });

  it("400s on a malformed case id rather than falling back to the actor's own", async () => {
    const res = await viewRequest("not-a-uuid");

    expect(res.status).toBe(400);
    expect(resolvePersonalCaseId).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("500s rather than signing a stored path that belongs to ANOTHER case", async () => {
    // Defence in depth against our own data. If a `documents` row on this case somehow carries a
    // `case/<other>/…` key, authorizing THIS case and signing THAT path is a cross-case
    // disclosure — and the case check cannot see it, because it is about the case and the
    // signature is about the key.
    from.mockReturnValue(singleRow({ file_path: `case/${PERSONAL}/x.png` }));

    const res = await viewRequest(REQUESTED);

    expect(res.status).toBe(500);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("UNCHANGED with no case named: the actor's own case", async () => {
    const res = await viewRequest();

    expect(res.status).toBe(200);
    expect(resolvePersonalCaseId).toHaveBeenCalledWith(ACTOR, expect.anything());
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, PERSONAL, "case.read", expect.anything());
  });
});
