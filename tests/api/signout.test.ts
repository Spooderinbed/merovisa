import { describe, it, expect, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signOut } }),
}));

import { POST } from "@/app/auth/signout/route";

describe("POST /auth/signout", () => {
  it("signs out and redirects home", async () => {
    const res = await POST(new Request("http://localhost/auth/signout", { method: "POST" }));
    expect(signOut).toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });
});
