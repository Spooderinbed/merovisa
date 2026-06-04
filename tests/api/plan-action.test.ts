import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser, setPlanItemStatus } = vi.hoisted(() => ({
  getUser: vi.fn(),
  setPlanItemStatus: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/plan/repo", () => ({ setPlanItemStatus }));

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
    expect(setPlanItemStatus).toHaveBeenCalledWith({ tag: "admin" }, "u1", 1, "done");
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
});
