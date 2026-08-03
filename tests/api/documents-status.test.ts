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

// MV-157: every migrated route and page resolves the actor's personal case and
// authorizes it before its first query. Both are mocked to the happy path here;
// the denial branch is asserted where the route owns it.
const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  ensurePersonalCase: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));
beforeEach(() => {
  resolvePersonalCaseId.mockResolvedValue("case-1");
  ensurePersonalCase.mockResolvedValue("case-1");
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
});

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
  // `setObtained` now reports whether the write LANDED (review minor 7): it used
  // to return `void`, so a refusal and a stored tick were the same value.
  setObtained.mockResolvedValue(true);
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
    expect(setObtained).toHaveBeenCalledWith(expect.anything(), "case-1", "passport", true);
  });

  it("passes obtained=false through to the repo", async () => {
    signedIn();
    const res = await POST(post({ kind: "ielts", obtained: false }));
    expect(res.status).toBe(200);
    expect(setObtained).toHaveBeenCalledWith(expect.anything(), "case-1", "ielts", false);
  });

  it("500s — never ok:true — when the toggle was not stored", async () => {
    // Review minor 7: MV-157 added a SECOND silent-success path here. A case with
    // no `student_user_id` made `setObtained` return early and the route still
    // answered 200 {ok:true}, so the checklist rendered a tick that was gone on
    // the next reload. A PostgREST error did the same.
    signedIn();
    setObtained.mockResolvedValue(false);
    const res = await POST(post({ kind: "passport", obtained: true }));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).not.toBe(true);
  });
});
