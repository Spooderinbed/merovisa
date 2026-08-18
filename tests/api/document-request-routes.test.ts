import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * MV-182 — the two write surfaces of the document chase list, asserted at the
 * route, where the ordering lives.
 *
 * The property these hold: **authorize, then write.** Every denial case asserts the
 * route never reached the repository, which is what a "write first, check after"
 * refactor breaks while every happy-path test stays green.
 *
 * And the one this slice adds: **both routes gate on `case.documents.request`, and
 * both hand their repository the case id FROM THE PATH.** RLS cannot catch a
 * wrong-case write here — a counsellor legitimately reaches their own cases, so a
 * request resolved under the wrong case id is admitted and returns 200 against the
 * wrong student. There is no status to assert on; the ARGUMENT is the evidence
 * (spec F-8, the same reading `tests/api/case-scoped-routes.test.ts` states).
 *
 * `checkCasePermission` is mocked because it is proven against its own fixtures in
 * `tests/cases/require-permission.test.ts`. What is NOT mocked is **which**
 * permission each route asks for — that is the assertion that catches a route
 * gating a consultancy write on `case.read`, which the linked student holds.
 */

const { getUser, serverClient } = vi.hoisted(() => {
  const getUser = vi.fn();
  return { getUser, serverClient: { auth: { getUser }, from: vi.fn() } };
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => serverClient,
}));

const { checkCasePermission } = vi.hoisted(() => ({ checkCasePermission: vi.fn() }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

const { createCaseDocumentRequest, resolveCaseDocumentRequest } = vi.hoisted(() => ({
  createCaseDocumentRequest: vi.fn(),
  resolveCaseDocumentRequest: vi.fn(),
}));
vi.mock("@/lib/cases/document-requests-repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/document-requests-repo")>(
    "@/lib/cases/document-requests-repo",
  );
  return { ...actual, createCaseDocumentRequest, resolveCaseDocumentRequest };
});

import { POST } from "@/app/api/cases/[caseId]/document-requests/route";
import { PATCH } from "@/app/api/cases/[caseId]/document-requests/[requestId]/route";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CASE = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR = "99999999-9999-4999-8999-999999999999";

const allow = { decision: { allowed: true, requiredScope: "assigned", reason: null }, context: {} };
const denyFor = (reason: string) => ({
  decision: { allowed: false, requiredScope: null, reason },
  context: {},
});

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/x/document-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/x/document-requests/y", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  checkCasePermission.mockResolvedValue(allow);
  createCaseDocumentRequest.mockResolvedValue({ ok: true, id: REQUEST_ID });
  resolveCaseDocumentRequest.mockResolvedValue({ ok: true });
});

describe("POST /api/cases/[caseId]/document-requests — asking the case for a document", () => {
  it("gates on case.documents.request, not on case.read", async () => {
    await POST(postRequest({ kind: "passport", title: "Passport bio page" }), {
      params: Promise.resolve({ caseId: CASE_ID }),
    });

    // `case.read` is `linked` for the student, so gating a CONSULTANCY write on it
    // would let a student mint requests against their own case at the app layer.
    // (The database refuses independently — `can_staff_case` — but a route that
    // relies on that has stopped authorizing.)
    expect(checkCasePermission).toHaveBeenCalledWith(
      ACTOR,
      CASE_ID,
      "case.documents.request",
      serverClient,
    );
  });

  it("hands the repository the case id from the PATH and the actor from the session", async () => {
    await POST(postRequest({ kind: "ielts", title: "IELTS Scorecard", note: "Academic." }), {
      params: Promise.resolve({ caseId: CASE_ID }),
    });

    expect(createCaseDocumentRequest).toHaveBeenCalledWith(
      ACTOR,
      CASE_ID,
      { kind: "ielts", title: "IELTS Scorecard", note: "Academic.", dueAt: null },
      serverClient,
    );
  });

  it("authorizes BEFORE it writes — a denial never reaches the repository", async () => {
    checkCasePermission.mockResolvedValue(denyFor("not-assigned"));

    const response = await POST(postRequest({ kind: "passport", title: "P" }), {
      params: Promise.resolve({ caseId: CASE_ID }),
    });

    expect(response.status).toBe(403);
    expect(createCaseDocumentRequest).not.toHaveBeenCalled();
  });

  it("keeps the three denial outcomes apart", async () => {
    checkCasePermission.mockResolvedValue(denyFor("lookup-failed"));
    // "We could not tell" is not "you may not". A 403 here sends a legitimate
    // counsellor to ask a colleague for access they already hold.
    expect(
      (await POST(postRequest({ kind: "passport", title: "P" }), {
        params: Promise.resolve({ caseId: CASE_ID }),
      })).status,
    ).toBe(500);

    checkCasePermission.mockResolvedValue(denyFor("unknown-case"));
    expect(
      (await POST(postRequest({ kind: "passport", title: "P" }), {
        params: Promise.resolve({ caseId: CASE_ID }),
      })).status,
    ).toBe(404);
  });

  it("refuses a malformed case id before a client exists", async () => {
    const response = await POST(postRequest({ kind: "passport", title: "P" }), {
      params: Promise.resolve({ caseId: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind, a blank title, and an unknown field at the boundary", async () => {
    for (const body of [
      { kind: "vibes", title: "V" },
      { kind: "passport", title: "" },
      { kind: "passport", title: "P", status: "resolved" },
      { kind: "passport", title: "P", requestedBy: "someone-else" },
    ]) {
      const response = await POST(postRequest(body), {
        params: Promise.resolve({ caseId: CASE_ID }),
      });
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
    expect(createCaseDocumentRequest).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(postRequest({ kind: "passport", title: "P" }), {
      params: Promise.resolve({ caseId: CASE_ID }),
    });

    expect(response.status).toBe(401);
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("maps every repository failure onto its own status", async () => {
    const cases: Array<[string, number]> = [
      ["denied", 403],
      ["unknown-case", 404],
      ["not-an-org-case", 422],
      ["invalid-input", 422],
      ["write-failed", 500],
    ];
    for (const [reason, status] of cases) {
      createCaseDocumentRequest.mockResolvedValue({ ok: false, reason });
      const response = await POST(postRequest({ kind: "passport", title: "P" }), {
        params: Promise.resolve({ caseId: CASE_ID }),
      });
      expect(response.status, reason).toBe(status);
    }
  });

  it("returns the new request id on success", async () => {
    const response = await POST(postRequest({ kind: "passport", title: "P" }), {
      params: Promise.resolve({ caseId: CASE_ID }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, id: REQUEST_ID });
  });
});

describe("PATCH /api/cases/[caseId]/document-requests/[requestId] — resolving one", () => {
  it("gates on case.documents.request for the case in the PATH", async () => {
    await PATCH(patchRequest({ status: "resolved" }), {
      params: Promise.resolve({ caseId: CASE_ID, requestId: REQUEST_ID }),
    });

    expect(checkCasePermission).toHaveBeenCalledWith(
      ACTOR,
      CASE_ID,
      "case.documents.request",
      serverClient,
    );
  });

  it("SCOPES THE MUTATION TO THAT CASE — the request id alone never decides", async () => {
    await PATCH(patchRequest({ status: "resolved" }), {
      params: Promise.resolve({ caseId: CASE_ID, requestId: REQUEST_ID }),
    });

    // Both ids travel. Drop the case id and a request belonging to another case the
    // actor happens to staff is resolved under THIS case's authorization, with a 200
    // and nothing to assert on — F-8's defect class exactly.
    expect(resolveCaseDocumentRequest).toHaveBeenCalledWith(REQUEST_ID, CASE_ID, serverClient);
    expect(resolveCaseDocumentRequest).not.toHaveBeenCalledWith(
      REQUEST_ID,
      OTHER_CASE,
      serverClient,
    );
  });

  it("authorizes BEFORE it writes", async () => {
    checkCasePermission.mockResolvedValue(denyFor("role-not-permitted"));

    const response = await PATCH(patchRequest({ status: "resolved" }), {
      params: Promise.resolve({ caseId: CASE_ID, requestId: REQUEST_ID }),
    });

    expect(response.status).toBe(403);
    expect(resolveCaseDocumentRequest).not.toHaveBeenCalled();
  });

  it("refuses a malformed case id OR request id before a client exists", async () => {
    for (const params of [
      { caseId: "nope", requestId: REQUEST_ID },
      { caseId: CASE_ID, requestId: "nope" },
    ]) {
      const response = await PATCH(patchRequest({ status: "resolved" }), {
        params: Promise.resolve(params),
      });
      expect(response.status, JSON.stringify(params)).toBe(400);
    }
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("accepts only `resolved` — the route ships one transition, not an arbitrary status write", async () => {
    for (const body of [{ status: "outstanding" }, { status: "cancelled" }, {}]) {
      const response = await PATCH(patchRequest(body), {
        params: Promise.resolve({ caseId: CASE_ID, requestId: REQUEST_ID }),
      });
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
    expect(resolveCaseDocumentRequest).not.toHaveBeenCalled();
  });

  it("maps every repository failure onto its own status", async () => {
    const cases: Array<[string, number]> = [
      ["denied", 403],
      ["invalid-input", 422],
      ["write-failed", 500],
    ];
    for (const [reason, status] of cases) {
      resolveCaseDocumentRequest.mockResolvedValue({ ok: false, reason });
      const response = await PATCH(patchRequest({ status: "resolved" }), {
        params: Promise.resolve({ caseId: CASE_ID, requestId: REQUEST_ID }),
      });
      expect(response.status, reason).toBe(status);
    }
  });

  it("requires a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(patchRequest({ status: "resolved" }), {
      params: Promise.resolve({ caseId: CASE_ID, requestId: REQUEST_ID }),
    });

    expect(response.status).toBe(401);
    expect(checkCasePermission).not.toHaveBeenCalled();
  });
});
