import { describe, it, expect, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signOut } }),
}));

import { POST } from "@/app/auth/signout/route";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/auth/signout", { method: "POST", headers });
}

describe("POST /auth/signout", () => {
  it("signs out and redirects home when origin matches", async () => {
    const res = await POST(makeRequest({ origin: "http://localhost" }));
    expect(signOut).toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("signs out when referer is same-origin", async () => {
    signOut.mockClear();
    const res = await POST(makeRequest({ referer: "http://localhost/dashboard" }));
    expect(signOut).toHaveBeenCalled();
    expect(res.status).toBe(307);
  });

  it("rejects cross-origin POST with 403", async () => {
    signOut.mockClear();
    const res = await POST(makeRequest({ origin: "http://evil.example.com" }));
    expect(signOut).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it("rejects POST with no Origin or Referer at all", async () => {
    signOut.mockClear();
    const res = await POST(makeRequest({}));
    expect(signOut).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });
});
