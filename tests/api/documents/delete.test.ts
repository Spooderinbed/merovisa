import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getUser,
  serverSingle,
  listDocumentsByKinds,
  patchProfileSection,
  invalidatePlan,
  reScoreAssessment,
  adminRemove,
  adminDelete,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  serverSingle: vi.fn(),
  listDocumentsByKinds: vi.fn(),
  patchProfileSection: vi.fn(),
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
function adminDeleteChain() {
  const chain = {
    delete: () => chain,
    eq: () => chain,
  };
  // Final eq() resolves the delete; make eq itself awaitable via adminDelete.
  return new Proxy(chain, {
    get(target, prop) {
      if (prop === "eq") return () => adminDelete() ?? chain;
      if (prop === "delete") return () => chain;
      return Reflect.get(target, prop);
    },
  });
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
vi.mock("@/lib/documents/repo", () => ({ listDocumentsByKinds }));
vi.mock("@/lib/profiles/repo", () => ({ patchProfileSection }));
vi.mock("@/lib/plan/invalidate", () => ({ invalidatePlan }));
vi.mock("@/lib/assessments/re-score", () => ({ reScoreAssessment }));

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
    listDocumentsByKinds.mockResolvedValue([]); // no remaining docs -> flag flips off
    patchProfileSection.mockResolvedValue(undefined);
    invalidatePlan.mockResolvedValue(undefined);
    reScoreAssessment.mockResolvedValue(undefined);
    adminRemove.mockResolvedValue({ error: null });
    adminDelete.mockReturnValue(Promise.resolve({ error: null }));
  });

  it("flips the flag off and invalidates the plan when the last doc is removed, without re-scoring", async () => {
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(200);

    expect(patchProfileSection).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "finance",
      { proofUploaded: false },
    );
    expect(invalidatePlan).toHaveBeenCalledTimes(1);
    expect(reScoreAssessment).not.toHaveBeenCalled();
  });

  it("leaves flags and plan alone (and never re-scores) when other docs of the group remain", async () => {
    listDocumentsByKinds.mockResolvedValue([
      { id: "d2", owner: "u1", kind: "loan-sanction", file_path: "x" },
    ]);
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(200);
    expect(patchProfileSection).not.toHaveBeenCalled();
    expect(invalidatePlan).not.toHaveBeenCalled();
    expect(reScoreAssessment).not.toHaveBeenCalled();
  });
});
