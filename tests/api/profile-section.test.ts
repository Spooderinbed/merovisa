import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser, patchProfileSection, invalidatePlan } = vi.hoisted(() => ({
  getUser: vi.fn(),
  patchProfileSection: vi.fn(),
  invalidatePlan: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/profiles/repo", () => ({ patchProfileSection }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/plan/invalidate", () => ({ invalidatePlan }));

import { PATCH } from "@/app/api/profile/section/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/profile/section", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/profile/section", () => {
  beforeEach(() => {
    getUser.mockReset();
    patchProfileSection.mockReset();
    invalidatePlan.mockReset();
  });

  it("401s when no user is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(req({ section: "personal", patch: { name: "X" } }));
    expect(res.status).toBe(401);
    expect(invalidatePlan).not.toHaveBeenCalled();
  });

  it("422s on invalid body", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await PATCH(req({ section: "academic", patch: { gradePercent: 150 } }));
    expect(res.status).toBe(422);
    expect(invalidatePlan).not.toHaveBeenCalled();
  });

  it("patches the section and returns the new completeness", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    patchProfileSection.mockResolvedValue({ completeness: 12, sections: { personal: { name: "X" } } });
    invalidatePlan.mockResolvedValue(undefined);
    const res = await PATCH(req({ section: "personal", patch: { name: "X" } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, completeness: 12 });
    expect(invalidatePlan).toHaveBeenCalled();
  });

  it("400s on malformed JSON", async () => {
    const res = await PATCH(new Request("http://localhost/api/profile/section", {
      method: "PATCH", body: "{bad",
    }));
    expect(res.status).toBe(400);
    expect(invalidatePlan).not.toHaveBeenCalled();
  });
});
