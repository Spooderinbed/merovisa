import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser, patchProfileSectionForCase, invalidatePlan } = vi.hoisted(() => ({
  getUser: vi.fn(),
  patchProfileSectionForCase: vi.fn(),
  invalidatePlan: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/profiles/repo", () => ({ patchProfileSectionForCase }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/plan/invalidate", () => ({ invalidatePlan }));

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
    patchProfileSectionForCase.mockReset();
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
    patchProfileSectionForCase.mockResolvedValue({ completeness: 12, sections: { personal: { name: "X" } } });
    invalidatePlan.mockResolvedValue(undefined);
    const res = await PATCH(req({ section: "personal", patch: { name: "X" } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, completeness: 12 });
    expect(invalidatePlan).toHaveBeenCalled();
  });

  it("returns 500 (never ok:true) when the profile write fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    patchProfileSectionForCase.mockRejectedValue(new Error("write failed"));
    const res = await PATCH(req({ section: "personal", patch: { name: "X" } }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).not.toBe(true);
    // Derived side-effects must not run when the primary write failed.
    expect(invalidatePlan).not.toHaveBeenCalled();
  });

  it("400s on malformed JSON", async () => {
    const res = await PATCH(new Request("http://localhost/api/profile/section", {
      method: "PATCH", body: "{bad",
    }));
    expect(res.status).toBe(400);
    expect(invalidatePlan).not.toHaveBeenCalled();
  });
});
