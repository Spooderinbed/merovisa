import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.CLAIM_HMAC_SECRET = "test-secret-must-be-32-chars-long-abc";
});

import { signClaim } from "@/lib/auth/hmac-claim";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

const { exchangeCodeForSession, verifyOtp, getUser, claimAndBootstrapProfile } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  claimAndBootstrapProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp, getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/claim", () => ({ claimAndBootstrapProfile }));

import { GET } from "@/app/auth/callback/route";

const url = (qs: string) => new Request(`http://localhost/auth/callback?${qs}`);

/**
 * Run one request with the Vercel system env vars pinned. Since MV-177 the forwarded host is
 * only consulted behind an edge known to overwrite it, and these vars are what say so. Both
 * are pinned rather than only the one under test, so the result does not depend on whatever
 * the surrounding CI environment happens to export.
 */
async function withVercelEnv<T>(on: boolean, run: () => Promise<T>): Promise<T> {
  const prev = { VERCEL: process.env.VERCEL, VERCEL_ENV: process.env.VERCEL_ENV };
  if (on) {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
  } else {
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const onVercel = <T,>(run: () => Promise<T>): Promise<T> => withVercelEnv(true, run);
const offVercel = <T,>(run: () => Promise<T>): Promise<T> => withVercelEnv(false, run);

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    verifyOtp.mockReset();
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
        user: expect.objectContaining({ id: "user-1", email: "aarav@example.com" }),
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

  it("redirects home when there is neither a code nor an emailed token", async () => {
    const claimToken = signClaim(ASSESSMENT_UUID, Date.now() + 60_000);
    const res = await GET(url(`claim=${encodeURIComponent(claimToken)}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/assess");
  });

  // MV-147 security regression guard. This route briefly accepted an emailed
  // `token_hash` so the link in the sign-in email would work. That made it an
  // unmetered verification oracle: GoTrue derives the hash as an unsalted
  // sha224(email + otp), so for a known address it has the same 1,000,000
  // preimages as the 6-digit code — but an unauthenticated GET carries no address,
  // so the per-address cap in lib/auth/otp-attempts could not count guesses here.
  // Anyone re-adding a token_hash branch must bring a guess counter with it.
  it("refuses to verify an emailed token_hash — the counted code path is the only email route", async () => {
    const claimToken = signClaim(ASSESSMENT_UUID, Date.now() + 60_000);
    const res = await GET(url(`token_hash=abc123&type=email&claim=${encodeURIComponent(claimToken)}`));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(claimAndBootstrapProfile).not.toHaveBeenCalled();
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
    const res = await onVercel(() =>
      GET(
        new Request("http://localhost/auth/callback?code=abc", {
          headers: { "x-forwarded-host": "merovisa.vercel.app", "x-forwarded-proto": "https" },
        }),
      ),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://merovisa.vercel.app/dashboard");
  });

  it("does NOT redirect to a forged x-forwarded-host when no trusted edge set it (MV-177)", async () => {
    // The origin half of `${origin}${destination}` is the one part of this redirect that comes
    // from request data. safeNext guards the destination half only. Off Vercel nothing
    // overwrites the header, so it is a claim rather than evidence and must not be honoured.
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await offVercel(() =>
      GET(
        new Request("http://localhost/auth/callback?code=abc", {
          headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" },
        }),
      ),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).not.toContain("attacker");
    expect(res.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("survives the comma-joined x-forwarded-host a chain of proxies produces (MV-177)", async () => {
    // `${proto}://${host}` would be "https://a.host, b.host" — unparseable, and
    // NextResponse.redirect throws on it, so the sign-in page 500s instead of signing anyone
    // in. Same failure class as MV-176, reached through a header instead of the query string.
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await onVercel(() =>
      GET(
        new Request("http://localhost/auth/callback?code=abc", {
          headers: { "x-forwarded-host": "a.host, b.host", "x-forwarded-proto": "https" },
        }),
      ),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("prefers NEXT_PUBLIC_SITE_URL over the request origin and forwarded host", async () => {
    // The deterministic escape hatch: an explicit configured site URL wins over everything,
    // so a misbehaving proxy header can't send users anywhere but the configured site.
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://merovisa.vercel.app/";
    try {
      exchangeCodeForSession.mockResolvedValue({ error: null });
      getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
      const req = new Request("http://localhost/auth/callback?code=abc", {
        headers: { "x-forwarded-host": "wrong-host.example" },
      });
      const res = await GET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://merovisa.vercel.app/dashboard");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });
});
