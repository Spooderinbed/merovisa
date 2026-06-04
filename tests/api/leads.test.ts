import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit/upstash", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  ipFromRequest: vi.fn().mockReturnValue("1.2.3.4"),
}));

const { createLead } = vi.hoisted(() => ({ createLead: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/repo", () => ({ createLead }));

import { POST } from "@/app/api/leads/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/leads", () => {
  beforeEach(() => createLead.mockReset());

  it("captures a valid lead and returns 200", async () => {
    createLead.mockResolvedValue(undefined);
    const res = await POST(req({ email: "a@b.com", assessmentId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(200);
    expect(createLead).toHaveBeenCalledWith(
      { tag: "admin" },
      { email: "a@b.com", assessmentId: "11111111-1111-1111-1111-111111111111" },
    );
  });

  it("returns 422 for an invalid body", async () => {
    const res = await POST(req({ email: "nope", assessmentId: "x" }));
    expect(res.status).toBe(422);
    expect(createLead).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await POST(new Request("http://localhost/api/leads", { method: "POST", body: "{bad" }));
    expect(res.status).toBe(400);
  });
});
