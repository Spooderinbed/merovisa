import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.CLAIM_HMAC_SECRET = "test-secret-must-be-32-chars-long-abc";
});

import { signClaim } from "@/lib/auth/hmac-claim";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

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
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "aarav@example.com", user_metadata: { full_name: "Aarav" } } } });
    claimAndBootstrapProfile.mockResolvedValue({ claimed: true });

    const claimToken = signClaim(ASSESSMENT_UUID, Date.now() + 60_000);
    const res = await GET(url(`code=abc&claim=${encodeURIComponent(claimToken)}`));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(claimAndBootstrapProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        assessmentId: ASSESSMENT_UUID,
        userId: "user-1",
        googleName: "Aarav",
        email: "aarav@example.com",
      }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(`/assessment/${ASSESSMENT_UUID}`);
  });

  it("redirects to /assess with an error flag when the code exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad code" } });
    const claimToken = signClaim(ASSESSMENT_UUID, Date.now() + 60_000);
    const res = await GET(url(`code=bad&claim=${encodeURIComponent(claimToken)}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assess");
    expect(res.headers.get("location")).toContain("error=auth");
  });

  it("redirects home when there is no code", async () => {
    const claimToken = signClaim(ASSESSMENT_UUID, Date.now() + 60_000);
    const res = await GET(url(`claim=${encodeURIComponent(claimToken)}`));
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

  it("redirects to /assess?error=expired when the claim fails (expired or wrong owner)", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false });
    const claimToken = signClaim(ASSESSMENT_UUID, Date.now() + 60_000);
    const res = await GET(url(`code=abc&claim=${encodeURIComponent(claimToken)}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assess?error=expired");
  });

  it("rejects an unsigned (raw) claim and redirects to /assess?error=invalid-claim", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    // Pass the raw UUID without HMAC signing — should be rejected
    const res = await GET(url(`code=abc&claim=${ASSESSMENT_UUID}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assess?error=invalid-claim");
    expect(claimAndBootstrapProfile).not.toHaveBeenCalled();
  });

  it("rejects an expired signed claim and redirects to /assess?error=invalid-claim", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const expiredToken = signClaim(ASSESSMENT_UUID, Date.now() - 1000);
    const res = await GET(url(`code=abc&claim=${encodeURIComponent(expiredToken)}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assess?error=invalid-claim");
    expect(claimAndBootstrapProfile).not.toHaveBeenCalled();
  });

  it("honors a relative ?next= param when no claim", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await GET(url("code=abc&next=/profile"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/profile");
  });

  it("rejects a protocol-relative ?next= and falls back to /dashboard", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    const res = await GET(url("code=abc&next=//attacker.com"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(res.headers.get("location")).not.toContain("attacker");
  });

  it("redirects to the public x-forwarded-host, not the internal request origin (Vercel proxy)", async () => {
    // On Vercel the function sees request.url with the internal host (localhost), while the
    // real public host arrives via x-forwarded-host. Using url.origin bounces prod sign-ins
    // to localhost — this asserts the forwarded host wins so production lands on the site.
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const req = new Request("http://localhost/auth/callback?code=abc", {
      headers: { "x-forwarded-host": "merovisa.vercel.app", "x-forwarded-proto": "https" },
    });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://merovisa.vercel.app/dashboard");
  });
});
