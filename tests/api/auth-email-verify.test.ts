import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.CLAIM_HMAC_SECRET = "test-secret-must-be-32-chars-long-abc";
});

const {
  verifyOtp,
  getUser,
  claimAndBootstrapProfile,
  checkRateLimit,
  recordOtpAttempt,
  clearOtpAttempts,
} = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  claimAndBootstrapProfile: vi.fn(),
  checkRateLimit: vi.fn(),
  recordOtpAttempt: vi.fn(),
  clearOtpAttempts: vi.fn(),
}));

vi.mock("@/lib/auth/otp-attempts", () => ({
  MAX_OTP_ATTEMPTS: 5,
  recordOtpAttempt,
  clearOtpAttempts,
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
    recordOtpAttempt.mockReset();
    recordOtpAttempt.mockResolvedValue(1);
    clearOtpAttempts.mockReset();
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
      expect.objectContaining({
        assessmentId: ASSESSMENT_UUID,
        user: expect.objectContaining({ id: "user-1" }),
      }),
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

  // The IP limits above (ours and GoTrue's) are both per-IP, so a rotating pool of
  // ~1,400 IPs could otherwise land ~500k guesses inside the code's one-hour life —
  // against a 1,000,000 keyspace, on the only credential these accounts have.
  // Burning the code after a few misses caps it at MAX_OTP_ATTEMPTS per code, and
  // codes are already capped at 5/hour per address by the send endpoint.
  describe("brute-force defence (per address, not per IP)", () => {
    it("counts the guess against the address, not just the IP", async () => {
      verifyOtp.mockResolvedValue({ error: { message: "invalid" } });
      await POST(post({ email: "a@b.com", code: "000000" }));
      expect(recordOtpAttempt).toHaveBeenCalledWith("a@b.com");
    });

    // Reserve-then-verify, not verify-then-count: the attempt must be claimed
    // before the guess is spent, or concurrent guesses all pass one stale read.
    it("claims the attempt before forwarding the guess to Supabase", async () => {
      const order: string[] = [];
      recordOtpAttempt.mockImplementation(async () => {
        order.push("count");
        return 1;
      });
      verifyOtp.mockImplementation(async () => {
        order.push("verify");
        return { error: { message: "invalid" } };
      });
      await POST(post({ email: "a@b.com", code: "000000" }));
      expect(order).toEqual(["count", "verify"]);
    });

    it("stops forwarding guesses to Supabase once the code is burned", async () => {
      recordOtpAttempt.mockResolvedValue(6);
      const res = await POST(post({ email: "a@b.com", code: "000000" }));
      expect(verifyOtp).not.toHaveBeenCalled();
      expect(res.status).toBe(401);
      expect((await res.json()).error).toMatch(/new code/i);
    });

    it("tells the student to request a new code on the miss that burns it", async () => {
      verifyOtp.mockResolvedValue({ error: { message: "invalid" } });
      recordOtpAttempt.mockResolvedValue(5);
      const res = await POST(post({ email: "a@b.com", code: "000000" }));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toMatch(/new code/i);
    });

    // The reserved attempt must not lock out the guess that is actually correct.
    it("still accepts the correct code on the last allowed attempt", async () => {
      recordOtpAttempt.mockResolvedValue(5);
      verifyOtp.mockResolvedValue({ error: null });
      getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
      const res = await POST(post({ email: "a@b.com", code: "123456" }));
      expect(res.status).toBe(200);
      expect(clearOtpAttempts).toHaveBeenCalledWith("a@b.com");
    });

    // Not an address lockout: burning is per-code and a resend clears it, so an
    // attacker can never park a victim outside their own account.
    it("clears the count on a successful sign-in", async () => {
      verifyOtp.mockResolvedValue({ error: null });
      getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
      await POST(post({ email: "a@b.com", code: "123456" }));
      expect(clearOtpAttempts).toHaveBeenCalledWith("a@b.com");
    });

    it("counts against the normalized address, so casing can't split the counter", async () => {
      verifyOtp.mockResolvedValue({ error: { message: "invalid" } });
      await POST(post({ email: " A@B.com ", code: "000000" }));
      expect(recordOtpAttempt).toHaveBeenCalledWith("a@b.com");
    });
  });
});
