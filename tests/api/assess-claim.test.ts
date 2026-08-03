import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

const { getUser, claimAndBootstrapProfile, checkRateLimit } = vi.hoisted(() => ({
  getUser: vi.fn(),
  claimAndBootstrapProfile: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/claim", () => ({ claimAndBootstrapProfile }));
vi.mock("@/lib/rate-limit/upstash", () => ({ checkRateLimit, ipFromRequest: () => "1.2.3.4" }));

import { POST } from "@/app/api/assess/claim/route";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

const post = (body: unknown) =>
  new Request("http://localhost/api/assess/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/assess/claim (signed-in recover-in-place, MV-130)", () => {
  beforeEach(() => {
    getUser.mockReset();
    claimAndBootstrapProfile.mockReset();
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue(true);
  });

  it("claims the still-unclaimed assessment for the signed-in user and returns where to land", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    claimAndBootstrapProfile.mockResolvedValue({ claimed: true });

    const res = await POST(post({ assessmentId: ASSESSMENT_UUID }));

    expect(claimAndBootstrapProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        assessmentId: ASSESSMENT_UUID,
        user: expect.objectContaining({ id: "u1", email: "a@b.com" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirectTo: `/assessment/${ASSESSMENT_UUID}` });
  });

  it("treats an already-mine row as success (a retry that actually worked)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false, reason: "already-mine" });
    const res = await POST(post({ assessmentId: ASSESSMENT_UUID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirectTo: `/assessment/${ASSESSMENT_UUID}` });
  });

  it("refuses when there is no session — an anonymous visitor recovers by signing in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ assessmentId: ASSESSMENT_UUID }));
    expect(res.status).toBe(401);
    expect(claimAndBootstrapProfile).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID assessment id before touching the claim path", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(post({ assessmentId: "not-a-uuid" }));
    expect(res.status).toBe(422);
    expect(claimAndBootstrapProfile).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
  });

  it("rate limits abusive retries", async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    const res = await POST(post({ assessmentId: ASSESSMENT_UUID }));
    expect(res.status).toBe(429);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("reports a claimed-elsewhere row honestly with 409, not a false success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false, reason: "claimed" });
    const res = await POST(post({ assessmentId: ASSESSMENT_UUID }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, reason: "claimed" });
  });

  it("reports an expired/purged row honestly with 410", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false, reason: "expired" });
    const res = await POST(post({ assessmentId: ASSESSMENT_UUID }));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ ok: false, reason: "expired" });
  });

  it("marks a transient failure retryable with 503", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false, reason: "error" });
    const res = await POST(post({ assessmentId: ASSESSMENT_UUID }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: "error" });
  });
});
