import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getUser,
  serverSingle,
  listDocumentsByKindsForCase,
  patchProfileSectionForCase,
  invalidatePlan,
  reScoreAssessment,
  adminRemove,
  adminDelete,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  serverSingle: vi.fn(),
  listDocumentsByKindsForCase: vi.fn(),
  patchProfileSectionForCase: vi.fn(),
  invalidatePlan: vi.fn(),
  reScoreAssessment: vi.fn(),
  adminRemove: vi.fn(),
  adminDelete: vi.fn(),
}));

// Server client: supabase.from("documents").select().eq().eq().single() -> { data: doc }
function serverFrom() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: serverSingle,
  };
  return chain;
}
// Admin client: storage.from().remove(); from("documents").delete().eq().eq()
// The chain is thenable so `await ...delete().eq().eq()` resolves to adminDelete()
// — letting a test inject a { error } and assert the route surfaces it.
function adminDeleteChain() {
  const chain = {
    delete: () => chain,
    eq: () => chain,
    then: (resolve: (r: unknown) => unknown) => resolve(adminDelete()),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, from: serverFrom }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ remove: adminRemove }) },
    from: () => adminDeleteChain(),
  }),
}));
vi.mock("@/lib/documents/repo", () => ({ listDocumentsByKindsForCase }));
vi.mock("@/lib/profiles/repo", () => ({ patchProfileSectionForCase }));
vi.mock("@/lib/plan/invalidate", () => ({ invalidatePlan }));
vi.mock("@/lib/assessments/re-score", () => ({ reScoreAssessment }));

// MV-157: every migrated route and page resolves the actor's personal case and
// authorizes it before its first query. Both are mocked to the happy path here;
// the denial branch is asserted where the route owns it.
const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  ensurePersonalCase: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));
beforeEach(() => {
  resolvePersonalCaseId.mockResolvedValue("case-1");
  ensurePersonalCase.mockResolvedValue("case-1");
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
});

// MV-189 — the audit write is DOUBLED here on purpose. Its own behaviour is proven in
// tests/audit/write-audit-event.test.ts, and the routes' fail-closed wiring in
// tests/api/document-access-audit.test.ts. This suite is about the delete path and its flag side-effects, and the real
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

import { DELETE } from "@/app/api/documents/[id]/route";

function deleteReq(): Request {
  return new Request("http://localhost/api/documents/d1", { method: "DELETE" });
}

const params = Promise.resolve({ id: "d1" });

describe("DELETE /api/documents/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    serverSingle.mockResolvedValue({
      data: { id: "d1", owner: "u1", kind: "bank-statement", file_path: "u1/bank-statement/x.png" },
    });
    listDocumentsByKindsForCase.mockResolvedValue([]); // no remaining docs -> flag flips off
    patchProfileSectionForCase.mockResolvedValue(undefined);
    invalidatePlan.mockResolvedValue(undefined);
    reScoreAssessment.mockResolvedValue(undefined);
    adminRemove.mockResolvedValue({ error: null });
    adminDelete.mockReturnValue(Promise.resolve({ error: null }));
  });

  it("flips the flag off and invalidates the plan when the last doc is removed, without re-scoring", async () => {
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(200);

    expect(patchProfileSectionForCase).toHaveBeenCalledWith(
      expect.anything(),
      "case-1",
      "finance",
      { proofUploaded: false },
    );
    expect(invalidatePlan).toHaveBeenCalledTimes(1);
    expect(reScoreAssessment).not.toHaveBeenCalled();
  });

  it("leaves flags and plan alone (and never re-scores) when other docs of the group remain", async () => {
    listDocumentsByKindsForCase.mockResolvedValue([
      { id: "d2", owner: "u1", kind: "loan-sanction", file_path: "x" },
    ]);
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(200);
    expect(patchProfileSectionForCase).not.toHaveBeenCalled();
    expect(invalidatePlan).not.toHaveBeenCalled();
    expect(reScoreAssessment).not.toHaveBeenCalled();
  });

  it("returns 500 (never ok:true) when the documents row delete fails", async () => {
    adminDelete.mockReturnValue(Promise.resolve({ error: { message: "delete boom" } }));
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).not.toBe(true);
    // No false flag-flip / plan work after a failed primary delete.
    expect(patchProfileSectionForCase).not.toHaveBeenCalled();
  });

  it("returns 500 when removing the stored file fails", async () => {
    adminRemove.mockResolvedValue({ error: { message: "storage boom" } });
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).not.toBe(true);
  });
});
