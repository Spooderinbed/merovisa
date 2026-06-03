import { describe, it, expect, vi, beforeEach } from "vitest";

const { exchangeCodeForSession, getUser, claimAndBootstrapProfile } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  claimAndBootstrapProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession, getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/claim", () => ({ claimAndBootstrapProfile }));

import { GET } from "@/app/auth/callback/route";

const url = (qs: string) => new Request(`http://localhost/auth/callback?${qs}`);

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getUser.mockReset();
    claimAndBootstrapProfile.mockReset();
  });

  it("exchanges the code, claims+bootstraps, and redirects to the assessment", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1", user_metadata: { full_name: "Aarav" } } } });
    claimAndBootstrapProfile.mockResolvedValue({ claimed: true });

    const res = await GET(url("code=abc&claim=aid-1"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(claimAndBootstrapProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assessmentId: "aid-1", userId: "user-1", googleName: "Aarav" }),
    );
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

  it("redirects to /dashboard when there is no claim", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await GET(url("code=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("honors a relative ?next= param when no claim", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await GET(url("code=abc&next=/profile"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/profile");
  });
});
