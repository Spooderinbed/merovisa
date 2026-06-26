import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getUser,
  checkRateLimit,
  getDocumentByKind,
  insertDocument,
  deleteDocument,
  patchProfileSection,
  invalidatePlan,
  reScoreAssessment,
  storageUpload,
  storageRemove,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  checkRateLimit: vi.fn(),
  getDocumentByKind: vi.fn(),
  insertDocument: vi.fn(),
  deleteDocument: vi.fn(),
  patchProfileSection: vi.fn(),
  invalidatePlan: vi.fn(),
  reScoreAssessment: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ upload: storageUpload, remove: storageRemove }) },
  }),
}));
vi.mock("@/lib/documents/repo", () => ({ getDocumentByKind, insertDocument, deleteDocument }));
vi.mock("@/lib/profiles/repo", () => ({ patchProfileSection }));
vi.mock("@/lib/plan/invalidate", () => ({ invalidatePlan }));
vi.mock("@/lib/assessments/re-score", () => ({ reScoreAssessment }));
vi.mock("@/lib/rate-limit/upstash", () => ({ checkRateLimit }));
// Magic-byte check passes so we reach the flag-flip block.
vi.mock("@/lib/documents/upload-validation", () => ({
  sanitizeFilename: (n: string) => n,
  verifyFileMagic: () => true,
  extensionFor: () => "png",
}));

import { POST } from "@/app/api/documents/upload/route";

// jsdom/undici can't round-trip a multipart Request body, so stub formData()
// directly instead of relying on the runtime to parse it.
function uploadReq(kind: string, type = "image/png"): Request {
  const form = new FormData();
  const file = new File([new Uint8Array([1, 2, 3])], "proof", { type });
  form.set("file", file);
  form.set("kind", kind);
  return {
    formData: async () => form,
  } as unknown as Request;
}

describe("POST /api/documents/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    checkRateLimit.mockResolvedValue(true);
    getDocumentByKind.mockResolvedValue(null);
    insertDocument.mockResolvedValue("doc-1");
    patchProfileSection.mockResolvedValue(undefined);
    invalidatePlan.mockResolvedValue(undefined);
    storageUpload.mockResolvedValue({ error: null });
    storageRemove.mockResolvedValue({ error: null });
  });

  it("flips the finance flag and invalidates the plan, without re-scoring", async () => {
    const res = await POST(uploadReq("bank-statement"));
    expect(res.status).toBe(200);

    // The profile flag still flips — it drives the plan/checklist.
    expect(patchProfileSection).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "finance",
      { proofUploaded: true },
    );
    // The plan generator genuinely consumes the document flags.
    expect(invalidatePlan).toHaveBeenCalledTimes(1);
    // The scoring engine ignores document flags, so the re-score is a no-op.
    expect(reScoreAssessment).not.toHaveBeenCalled();
  });

  it("flips the english flag without re-scoring", async () => {
    const res = await POST(uploadReq("ielts"));
    expect(res.status).toBe(200);
    expect(patchProfileSection).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "english",
      { reportUploaded: true },
    );
    expect(invalidatePlan).toHaveBeenCalledTimes(1);
    expect(reScoreAssessment).not.toHaveBeenCalled();
  });

  it("does not touch flags, plan, or re-score for a non-flag kind", async () => {
    const res = await POST(uploadReq("passport"));
    expect(res.status).toBe(200);
    expect(patchProfileSection).not.toHaveBeenCalled();
    expect(invalidatePlan).not.toHaveBeenCalled();
    expect(reScoreAssessment).not.toHaveBeenCalled();
  });

  it("returns 500 and removes the orphaned file when the row insert fails", async () => {
    // The file uploaded to Storage but the documents row never persisted — the
    // route must not report success (id:null/stored) and must clean up the orphan.
    insertDocument.mockResolvedValue(null);
    const res = await POST(uploadReq("bank-statement"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.status).not.toBe("stored");
    // Orphaned object rolled back (upload succeeded, then remove on the new path).
    expect(storageRemove).toHaveBeenCalled();
    // No false flag-flip after a failed primary write.
    expect(patchProfileSection).not.toHaveBeenCalled();
  });

  it("accepts a PDF — the real format of transcripts, offers, and loan letters", async () => {
    const res = await POST(uploadReq("offer-letter", "application/pdf"));
    expect(res.status).toBe(200);
  });

  it("rejects a disallowed type with 422", async () => {
    const res = await POST(uploadReq("passport", "application/zip"));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/PDF/);
  });
});
