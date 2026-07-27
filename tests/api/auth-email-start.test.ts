import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

const { signInWithOtp, checkRateLimit, clearOtpAttempts } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  checkRateLimit: vi.fn(),
  clearOtpAttempts: vi.fn(),
}));

vi.mock("@/lib/auth/otp-attempts", () => ({ clearOtpAttempts }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithOtp } }),
}));
vi.mock("@/lib/rate-limit/upstash", () => ({
  checkRateLimit,
  ipFromRequest: () => "1.2.3.4",
}));

import { POST } from "@/app/api/auth/email/start/route";

const post = (body: unknown) =>
  new Request("http://localhost/api/auth/email/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const redirectTo = () => signInWithOtp.mock.calls[0]![0].options.emailRedirectTo as string;

describe("POST /api/auth/email/start", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue(true);
    signInWithOtp.mockResolvedValue({ error: null });
  });

  it("sends a code to a student who has no account yet", async () => {
    const res = await POST(post({ email: "aarav@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "aarav@example.com",
        options: expect.objectContaining({ shouldCreateUser: true }),
      }),
    );
  });

  it("normalizes the address so casing and stray spaces don't fork the account", async () => {
    await POST(post({ email: "  Aarav@Example.COM  " }));
    expect(signInWithOtp.mock.calls[0]![0].email).toBe("aarav@example.com");
  });

  it("carries the claim token into the emailed link so it claims the same assessment", async () => {
    await POST(post({ email: "a@b.com", claim: "sometoken.123.sig", next: "/profile" }));
    const url = new URL(redirectTo());
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("claim")).toBe("sometoken.123.sig");
    expect(url.searchParams.get("next")).toBe("/profile");
  });

  it("refuses to put an off-site next into the emailed link", async () => {
    await POST(post({ email: "a@b.com", next: "//attacker.com" }));
    const url = new URL(redirectTo());
    expect(url.searchParams.get("next")).toBe("/dashboard");
    expect(redirectTo()).not.toContain("attacker");
  });

  it("rejects a malformed address", async () => {
    const res = await POST(post({ email: "not-an-email" }));
    expect(res.status).toBe(422);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    const res = await POST(post("{oops"));
    expect(res.status).toBe(400);
  });

  it("rate limits by IP", async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    const res = await POST(post({ email: "a@b.com" }));
    expect(res.status).toBe(429);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("rate limits per address so one inbox can't be flooded from many IPs", async () => {
    checkRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const res = await POST(post({ email: "a@b.com" }));
    expect(res.status).toBe(429);
    expect(signInWithOtp).not.toHaveBeenCalled();
    const keys = checkRateLimit.mock.calls.map((c) => c[1]);
    expect(keys).toContain("a@b.com");
  });

  // Trust: a student staring at a code entry box for a code that was never sent is
  // a dead end. If Supabase couldn't send it, say so instead of faking success.
  it("reports honestly when the code could not be sent", async () => {
    signInWithOtp.mockResolvedValue({ error: { message: "email rate limit exceeded" } });
    const res = await POST(post({ email: "a@b.com" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/couldn't send/i);
  });

  // A new code must start with a clean slate, otherwise wrong guesses against the
  // previous code would burn this one on arrival — turning a brute-force defence
  // into a way to keep a student permanently locked out.
  it("clears the burnt-attempt count when a fresh code goes out", async () => {
    clearOtpAttempts.mockReset();
    await POST(post({ email: "a@b.com" }));
    expect(clearOtpAttempts).toHaveBeenCalledWith("a@b.com");
  });

  it("does not clear the count when sending failed", async () => {
    clearOtpAttempts.mockReset();
    signInWithOtp.mockResolvedValue({ error: { message: "smtp down" } });
    await POST(post({ email: "a@b.com" }));
    expect(clearOtpAttempts).not.toHaveBeenCalled();
  });
});
