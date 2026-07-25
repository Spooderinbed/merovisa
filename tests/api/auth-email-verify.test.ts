import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.CLAIM_HMAC_SECRET = "test-secret-must-be-32-chars-long-abc";
});

const { verifyOtp, getUser, claimAndBootstrapProfile, checkRateLimit } = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  claimAndBootstrapProfile: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp, getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/claim", () => ({ claimAndBootstrapProfile }));
vi.mock("@/lib/rate-limit/upstash", () => ({ checkRateLimit, ipFromRequest: () => "1.2.3.4" }));

import { signClaim } from "@/lib/auth/hmac-claim";
import { POST } from "@/app/api/auth/email/verify/route";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

const post = (body: unknown) =>
  new Request("http://localhost/api/auth/email/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/auth/email/verify", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    getUser.mockReset();
    claimAndBootstrapProfile.mockReset();
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue(true);
  });

  it("verifies the emailed code and signs the student in", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "a@b.com" } } });

    const res = await POST(post({ email: "a@b.com", code: "123456" }));

    expect(verifyOtp).toHaveBeenCalledWith({ email: "a@b.com", token: "123456", type: "email" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ redirectTo: "/dashboard" });
  });

  // AC: "Email sign-in claims an anonymous assessment identically to Google."
  it("claims the carried assessment and returns the same landing page as Google", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "a@b.com" } } });
    claimAndBootstrapProfile.mockResolvedValue({ claimed: true });

    const claim = signClaim(ASSESSMENT_UUID, Date.now() + 60_000);
    const res = await POST(post({ email: "a@b.com", code: "123456", claim }));

    expect(claimAndBootstrapProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assessmentId: ASSESSMENT_UUID, userId: "user-1" }),
    );
    expect(await res.json()).toEqual({ redirectTo: `/assessment/${ASSESSMENT_UUID}` });
  });

  it("normalizes the address the same way the send step does", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    await POST(post({ email: " A@B.com ", code: "123456" }));
    expect(verifyOtp.mock.calls[0]![0].email).toBe("a@b.com");
  });

  it("rejects a wrong or expired code without claiming anything", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const claim = signClaim(ASSESSMENT_UUID, Date.now() + 60_000);
    const res = await POST(post({ email: "a@b.com", code: "000000", claim }));
    expect(res.status).toBe(401);
    expect(claimAndBootstrapProfile).not.toHaveBeenCalled();
  });

  it("rejects a code that isn't six digits before spending a Supabase call", async () => {
    const res = await POST(post({ email: "a@b.com", code: "12" }));
    expect(res.status).toBe(422);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("rate limits guessing attempts", async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    const res = await POST(post({ email: "a@b.com", code: "123456" }));
    expect(res.status).toBe(429);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
