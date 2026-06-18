import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser, signOut, deleteUser, storageRemove, state } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  deleteUser: vi.fn(),
  storageRemove: vi.fn(),
  state: {
    docsList: [] as { file_path: string }[],
    deletedTables: [] as string[],
    failTable: null as string | null,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser, signOut } }),
}));

// Admin client: from(table).select().eq() resolves the doc list;
// from(table).delete().eq() records the table and resolves { error }.
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ data: state.docsList, error: null }),
      }),
      delete: () => ({
        eq: () => {
          state.deletedTables.push(table);
          return Promise.resolve({
            error: state.failTable === table ? { message: "boom" } : null,
          });
        },
      }),
    }),
    storage: { from: () => ({ remove: storageRemove }) },
    auth: { admin: { deleteUser } },
  }),
}));

import { POST } from "@/app/api/account/delete/route";

function req(headers: Record<string, string> = { origin: "http://localhost" }): Request {
  return new Request("http://localhost/api/account/delete", { method: "POST", headers });
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.docsList = [{ file_path: "u1/passport/a.png" }, { file_path: "u1/bank-statement/b.png" }];
    state.deletedTables = [];
    state.failTable = null;
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    signOut.mockResolvedValue({ error: null });
    deleteUser.mockResolvedValue({ error: null });
    storageRemove.mockResolvedValue({ error: null });
  });

  it("removes storage objects, every owned row, and the auth user, then signs out", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(storageRemove).toHaveBeenCalledWith([
      "u1/passport/a.png",
      "u1/bank-statement/b.png",
    ]);
    expect(state.deletedTables).toEqual([
      "plan_items",
      "user_program_state",
      "documents",
      "profiles",
      "assessments",
    ]);
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("skips storage removal when the user has no documents", async () => {
    state.docsList = [];
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(storageRemove).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it("surfaces a partial failure as 500 and does NOT sign out or claim success", async () => {
    state.failTable = "profiles";
    const res = await POST(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    expect(body.failedSteps).toContain("profiles:delete");
    // A half-deleted account must not be reported as gone.
    expect(signOut).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin POST with 403 before touching any data", async () => {
    const res = await POST(req({ origin: "http://evil.example.com" }));
    expect(res.status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(state.deletedTables).toEqual([]);
  });

  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
