import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser, upsertProgramState, deleteProgramState } = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsertProgramState: vi.fn(),
  deleteProgramState: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/matches/repo", () => ({ upsertProgramState, deleteProgramState }));

import { POST } from "@/app/api/shortlist/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/shortlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/shortlist", () => {
  beforeEach(() => {
    getUser.mockReset();
    upsertProgramState.mockReset();
    deleteProgramState.mockReset();
  });

  it("401s when not signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ programId: "p1", status: "shortlisted" }));
    expect(res.status).toBe(401);
  });

  it("upserts when status is set", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    upsertProgramState.mockResolvedValue(true);
    const res = await POST(req({ programId: "p1", status: "shortlisted" }));
    expect(res.status).toBe(200);
    expect(upsertProgramState).toHaveBeenCalled();
  });

  it("deletes when status is null", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    deleteProgramState.mockResolvedValue(true);
    const res = await POST(req({ programId: "p1", status: null }));
    expect(res.status).toBe(200);
    expect(deleteProgramState).toHaveBeenCalledWith({ tag: "admin" }, "u1", "p1");
  });

  it("422s on invalid body", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(req({ programId: "", status: "shortlisted" }));
    expect(res.status).toBe(422);
  });
});
