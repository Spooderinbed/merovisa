import { describe, it, expect, vi, beforeEach } from "vitest";

const { exchangeCodeForSession, getUser, claimAssessment } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  claimAssessment: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession, getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/repo", () => ({ claimAssessment }));

import { GET } from "@/app/auth/callback/route";

const url = (qs: string) => new Request(`http://localhost/auth/callback?${qs}`);

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getUser.mockReset();
    claimAssessment.mockReset();
  });

  it("exchanges the code, claims the assessment, and redirects to it", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    claimAssessment.mockResolvedValue(true);

    const res = await GET(url("code=abc&claim=aid-1"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(claimAssessment).toHaveBeenCalledWith({ tag: "admin" }, expect.objectContaining({ id: "aid-1", userId: "user-1" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assessment/aid-1");
  });

  it("redirects to /assess with an error flag when the code exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad code" } });
    const res = await GET(url("code=bad&claim=aid-1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assess");
    expect(res.headers.get("location")).toContain("error=auth");
  });

  it("redirects home when there is no code", async () => {
    const res = await GET(url("claim=aid-1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assess");
  });
});
