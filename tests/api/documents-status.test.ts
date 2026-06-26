import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getUser, setObtained } = vi.hoisted(() => ({
  getUser: vi.fn(),
  setObtained: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/documents/status-repo", () => ({ setObtained }));

import { POST } from "@/app/api/documents/status/route";

const post = (body: unknown) =>
  new Request("http://x/api/documents/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const signedIn = () => getUser.mockResolvedValue({ data: { user: { id: "owner1" } } });
const signedOut = () => getUser.mockResolvedValue({ data: { user: null } });

beforeEach(() => {
  vi.clearAllMocks();
  setObtained.mockResolvedValue(undefined);
});

describe("POST /api/documents/status", () => {
  it("401s when signed out", async () => {
    signedOut();
    const res = await POST(post({ kind: "passport", obtained: true }));
    expect(res.status).toBe(401);
    expect(setObtained).not.toHaveBeenCalled();
  });

  it("422s on an invalid body (unknown kind)", async () => {
    signedIn();
    const res = await POST(post({ kind: "not-a-kind", obtained: true }));
    expect(res.status).toBe(422);
    expect(setObtained).not.toHaveBeenCalled();
  });

  it("422s when obtained is missing", async () => {
    signedIn();
    const res = await POST(post({ kind: "passport" }));
    expect(res.status).toBe(422);
  });

  it("400s on invalid JSON", async () => {
    signedIn();
    const req = new Request("http://x/api/documents/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("200s and writes the toggle scoped to the session owner", async () => {
    signedIn();
    const res = await POST(post({ kind: "passport", obtained: true }));
    expect(res.status).toBe(200);
    expect(setObtained).toHaveBeenCalledWith(expect.anything(), "owner1", "passport", true);
  });

  it("passes obtained=false through to the repo", async () => {
    signedIn();
    const res = await POST(post({ kind: "ielts", obtained: false }));
    expect(res.status).toBe(200);
    expect(setObtained).toHaveBeenCalledWith(expect.anything(), "owner1", "ielts", false);
  });
});
