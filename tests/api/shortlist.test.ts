import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser, upsertProgramState, deleteProgramState, captureApplication } = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsertProgramState: vi.fn(),
  deleteProgramState: vi.fn(),
  captureApplication: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/matches/repo", () => ({ upsertProgramState, deleteProgramState }));
vi.mock("@/lib/outcomes/on-apply", () => ({ captureApplication }));

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
    captureApplication.mockReset();
    captureApplication.mockResolvedValue({ captured: true });
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
    // MV-157 §G: this route FLIPPED off the service-role client, so the write now
    // goes out on the authenticated client and is scoped by the resolved case.
    expect(deleteProgramState).toHaveBeenCalledWith(expect.anything(), "case-1", "p1");
  });

  it("422s on invalid body", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(req({ programId: "", status: "shortlisted" }));
    expect(res.status).toBe(422);
  });

  it("freezes a prediction + opens an attempt when status flips to applied", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    upsertProgramState.mockResolvedValue(true);
    const res = await POST(req({ programId: "p1", status: "applied" }));
    expect(res.status).toBe(200);
    expect(captureApplication).toHaveBeenCalledWith(expect.anything(), "case-1", "p1");
  });

  it("does not capture an application for non-applied statuses", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    upsertProgramState.mockResolvedValue(true);
    await POST(req({ programId: "p1", status: "shortlisted" }));
    expect(captureApplication).not.toHaveBeenCalled();
  });
});
