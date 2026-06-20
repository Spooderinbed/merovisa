import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser, getPrimary, reScoreAssessment, insert } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPrimary: vi.fn(),
  reScoreAssessment: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
// Admin client exposes `from("assessments").insert(...)` so the test can prove the
// refresh path NEVER inserts a new row (Option A re-scores in place instead).
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: () => ({ insert }) }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForUser: getPrimary }));
vi.mock("@/lib/assessments/re-score", () => ({ reScoreAssessment }));

import { POST } from "@/app/api/assess/refresh/route";

describe("POST /api/assess/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-scores the existing primary in place and returns its id (no new row)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimary.mockResolvedValue({ id: "primary-1" });
    reScoreAssessment.mockResolvedValue(undefined);

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ id: "primary-1" });

    expect(reScoreAssessment).toHaveBeenCalledWith(expect.anything(), "u1");
    // The whole point of MV-17: the re-assess path must NOT mint a new assessments row.
    expect(insert).not.toHaveBeenCalled();
  });

  it("401s when no user is signed in and never re-scores", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(reScoreAssessment).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not 500 when the user has no primary yet — points them to a fresh wizard", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimary.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.redirect).toBe("/assess?new=1");
    expect(reScoreAssessment).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
