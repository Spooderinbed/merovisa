import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser, setPlanItemStatus, setPlanItemStarted, getPlanItemKind } = vi.hoisted(() => ({
  getUser: vi.fn(),
  setPlanItemStatus: vi.fn(),
  setPlanItemStarted: vi.fn(),
  getPlanItemKind: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/plan/repo", () => ({ setPlanItemStatus, setPlanItemStarted, getPlanItemKind }));

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

import { POST } from "@/app/api/plan/action/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/plan/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/plan/action", () => {
  beforeEach(() => {
    getUser.mockReset();
    setPlanItemStatus.mockReset();
    setPlanItemStarted.mockReset();
    getPlanItemKind.mockReset();
    // Unknown kinds default to self-reported, so existing status tests stay valid.
    getPlanItemKind.mockResolvedValue("k");
  });

  it("401s when not signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ id: 1, status: "done" }));
    expect(res.status).toBe(401);
  });

  it("updates the item and returns 200 on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setPlanItemStatus.mockResolvedValue(true);
    const res = await POST(req({ id: 1, status: "done" }));
    expect(res.status).toBe(200);
    expect(setPlanItemStatus).toHaveBeenCalledWith({ tag: "admin" }, "case-1", 1, "done");
  });

  it("422s on invalid body", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(req({ id: -1, status: "bogus" }));
    expect(res.status).toBe(422);
  });

  it("400s on malformed JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/plan/action", { method: "POST", body: "{bad" }),
    );
    expect(res.status).toBe(400);
  });

  it("marks a self-reported item in progress", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPlanItemKind.mockResolvedValue("apply-for-noc");
    setPlanItemStarted.mockResolvedValue(true);
    const res = await POST(req({ id: 7, started: true }));
    expect(res.status).toBe(200);
    expect(setPlanItemStarted).toHaveBeenCalledWith({ tag: "admin" }, "case-1", 7, true);
  });

  it("rejects manual done on a verified item (computed truth wins)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPlanItemKind.mockResolvedValue("upload-ielts-report");
    const res = await POST(req({ id: 7, status: "done" }));
    expect(res.status).toBe(422);
    expect(setPlanItemStatus).not.toHaveBeenCalled();
  });

  it("rejects in-progress on a verified item", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPlanItemKind.mockResolvedValue("upload-ielts-report");
    const res = await POST(req({ id: 7, started: true }));
    expect(res.status).toBe(422);
    expect(setPlanItemStarted).not.toHaveBeenCalled();
  });

  it("still allows dismiss and undo on a verified item", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPlanItemKind.mockResolvedValue("upload-ielts-report");
    setPlanItemStatus.mockResolvedValue(true);
    const res = await POST(req({ id: 7, status: "dismissed" }));
    expect(res.status).toBe(200);
    expect(setPlanItemStatus).toHaveBeenCalledWith({ tag: "admin" }, "case-1", 7, "dismissed");
  });
});
