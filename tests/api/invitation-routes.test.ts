import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * MV-193 — the two invitation write surfaces, asserted at the route, where the ordering
 * lives (Stage 5 slice 1).
 *
 * The properties these hold:
 *
 *  * **Authorize, then write.** Every denial asserts the route never reached the
 *    repository — which for the mint means no token was ever generated for somebody who
 *    may not invite. That is what a "write first, check after" refactor breaks while
 *    every happy-path test stays green.
 *  * **Both routes gate on `case.invite_student`, not on `case.read`.** RLS refuses
 *    independently, but a route gating a consultancy write on the read claim has stopped
 *    authorizing and would ship the wrong status to every caller — and the linked student
 *    holds `case.read` at `linked`.
 *  * **Both hand the repository the case id FROM THE PATH.** RLS cannot catch a
 *    wrong-case write here: a counsellor legitimately reaches their own cases, so there is
 *    no status to assert on and the ARGUMENT is the evidence (spec F-8).
 *  * **No 2xx without the audit row** (MV-189 D12).
 *
 * `checkCasePermission` is mocked because it is proven against its own fixtures in
 * `tests/cases/require-permission.test.ts`. What is NOT mocked is WHICH permission each
 * route asks for.
 */

const { getUser, serverClient } = vi.hoisted(() => {
  const getUser = vi.fn();
  return { getUser, serverClient: { auth: { getUser }, from: vi.fn() } };
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => serverClient,
}));

const { adminClient, createSupabaseAdminClient } = vi.hoisted(() => {
  const adminClient = { from: vi.fn() };
  return { adminClient, createSupabaseAdminClient: vi.fn(() => adminClient) };
});
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

const { checkCasePermission } = vi.hoisted(() => ({ checkCasePermission: vi.fn() }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

const { createStudentInvitation, revokeCaseInvitation } = vi.hoisted(() => ({
  createStudentInvitation: vi.fn(),
  revokeCaseInvitation: vi.fn(),
}));
vi.mock("@/lib/cases/invitations-repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/invitations-repo")>(
    "@/lib/cases/invitations-repo",
  );
  return { ...actual, createStudentInvitation, revokeCaseInvitation };
});

// Typed at the mock rather than cast at each call site, so `writeAuditEvent.mock.calls`
// carries its argument shape and an assertion on the audit payload cannot silently be
// asserting on `undefined`.
const { writeAuditEvent } = vi.hoisted(() => ({
  writeAuditEvent: vi.fn(async (_db: unknown, _input: Record<string, unknown>) => {}),
}));
vi.mock("@/lib/audit/write-audit-event", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit/write-audit-event")>(
    "@/lib/audit/write-audit-event",
  );
  return { ...actual, writeAuditEvent };
});

import { POST } from "@/app/api/cases/[caseId]/invitations/route";
import { PATCH } from "@/app/api/cases/[caseId]/invitations/[invitationId]/route";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const INVITATION_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "a-plaintext-token-value-nobody-else-should-see";

const allow = {
  decision: { allowed: true, requiredScope: "assigned", reason: null },
  context: { organizationId: ORG },
};
const denyFor = (reason: string) => ({
  decision: { allowed: false, requiredScope: null, reason },
  context: { organizationId: ORG },
});

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/x/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/x/invitations/y", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mint = (caseId = CASE_ID) => POST(postRequest({ email: "student@example.test" }), {
  params: Promise.resolve({ caseId }),
});

const revoke = (caseId = CASE_ID, invitationId = INVITATION_ID) =>
  PATCH(patchRequest({ revoked: true }), {
    params: Promise.resolve({ caseId, invitationId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  checkCasePermission.mockResolvedValue(allow);
  createStudentInvitation.mockResolvedValue({
    ok: true,
    id: INVITATION_ID,
    token: TOKEN,
    expiresAt: "2026-08-30T00:00:00.000Z",
  });
  revokeCaseInvitation.mockResolvedValue({ ok: true });
  writeAuditEvent.mockResolvedValue(undefined);
});

describe("POST /api/cases/[caseId]/invitations — minting", () => {
  it("gates on case.invite_student, not on case.read", async () => {
    await mint();

    expect(checkCasePermission).toHaveBeenCalledWith(
      ACTOR,
      CASE_ID,
      "case.invite_student",
      serverClient,
    );
  });

  it("hands the repository the case id from the PATH and the actor from the session", async () => {
    await mint();

    expect(createStudentInvitation).toHaveBeenCalledWith(
      ACTOR,
      CASE_ID,
      "student@example.test",
      serverClient,
    );
  });

  it("returns the token and a fully-formed link, exactly once", async () => {
    const response = await mint();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(body.token).toBe(TOKEN);
    expect(body.link).toContain(TOKEN);
    expect(body.id).toBe(INVITATION_ID);
  });

  it("puts the token in the BODY and never in a header — not Location, not a cookie", async () => {
    const response = await mint();

    for (const [, value] of response.headers.entries()) {
      expect(value).not.toContain(TOKEN);
    }
    expect(response.headers.get("Location")).toBeNull();
  });

  it("passes no token into the audit event", async () => {
    await mint();

    const call = writeAuditEvent.mock.calls[0];
    if (call === undefined) throw new Error("writeAuditEvent was never called");
    const [, input] = call;
    expect(JSON.stringify(input)).not.toContain(TOKEN);
    expect(input.action).toBe("invitation.minted");
    expect(input.entityType).toBe("invitation");
    expect(input.entityId).toBe(INVITATION_ID);
    // D13 — the invited address is raw student detail and does not belong in an
    // evidence log. `entity_id` already identifies the row.
    expect(JSON.stringify(input)).not.toContain("student@example.test");
  });

  it("writes the audit event on the ADMIN client, and the invitation on the authenticated one", async () => {
    await mint();

    // `authenticated` holds SELECT on `audit_events` and no INSERT. The invitation row
    // itself must NOT ride the admin client — that would bypass `invitations_insert_staff`.
    expect(writeAuditEvent).toHaveBeenCalledWith(adminClient, expect.anything());
    expect(createStudentInvitation).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      serverClient,
    );
  });

  it("audits AFTER the row commits — an evidence log must not record a mint that failed", async () => {
    const order: string[] = [];
    createStudentInvitation.mockImplementation(async () => {
      await Promise.resolve();
      order.push("mint");
      return { ok: true, id: INVITATION_ID, token: TOKEN, expiresAt: "2026-08-30T00:00:00.000Z" };
    });
    writeAuditEvent.mockImplementation(async () => {
      // Resolve a microtask later, so a parallelised implementation cannot satisfy this
      // ordering by recording at invocation time (MISTAKES.md, MV-190).
      await Promise.resolve();
      order.push("audit");
    });

    await mint();

    expect(order).toEqual(["mint", "audit"]);
  });

  it("returns 500 and NO token when the audit write fails — D12, fail-closed", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));

    const response = await mint();
    const raw = await response.text();

    expect(response.status).toBe(500);
    // The invitation row exists and the counsellor never saw the token, which leaves it
    // visible as outstanding to revoke and re-mint. Handing back a credential nothing
    // recorded is the outcome this branch refuses.
    expect(raw).not.toContain(TOKEN);
  });

  it("refuses a malformed email with 422, before any client exists", async () => {
    const response = await POST(postRequest({ email: "not-an-email" }), {
      params: Promise.resolve({ caseId: CASE_ID }),
    });

    expect(response.status).toBe(422);
    expect(createStudentInvitation).not.toHaveBeenCalled();
  });

  it("refuses an unknown body key with 422 — the schema is strict", async () => {
    // Sending `role`, `expiresAt` or `token` is a misunderstanding worth reporting: every
    // one of those is decided by the server. A permissive schema would ignore it silently.
    const response = await POST(
      postRequest({ email: "student@example.test", role: "owner" }),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    );

    expect(response.status).toBe(422);
    expect(createStudentInvitation).not.toHaveBeenCalled();
  });

  it("400s a malformed case id before it can become a 500 from Postgres", async () => {
    const response = await mint("not-a-uuid");

    expect(response.status).toBe(400);
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("401s an anonymous caller and reaches nothing", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await mint();

    expect(response.status).toBe(401);
    expect(checkCasePermission).not.toHaveBeenCalled();
    expect(createStudentInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ["role-not-permitted", 403],
    ["not-assigned", 403],
    ["no-relationship", 403],
    ["membership-inactive", 403],
    ["unknown-case", 404],
    ["lookup-failed", 500],
  ])("denies %s with %i and NEVER mints a token", async (reason, status) => {
    checkCasePermission.mockResolvedValue(denyFor(reason));

    const response = await mint();

    expect(response.status).toBe(status);
    // The whole point: a denied caller must not cause a credential to exist at all.
    expect(createStudentInvitation).not.toHaveBeenCalled();
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });

  it("maps already-outstanding to 409, which is a different instruction from 422", async () => {
    createStudentInvitation.mockResolvedValue({ ok: false, reason: "already-outstanding" });

    const response = await mint();

    // The request was well-formed; the STATE refused it. The counsellor's next move is to
    // revoke the outstanding one, not to fix their input.
    expect(response.status).toBe(409);
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown-case", 404],
    ["not-an-org-case", 422],
    ["invalid-input", 422],
    ["denied", 403],
    ["write-failed", 500],
  ])("maps the repository's %s to %i and writes no audit row", async (reason, status) => {
    createStudentInvitation.mockResolvedValue({ ok: false, reason });

    const response = await mint();

    expect(response.status).toBe(status);
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/cases/[caseId]/invitations/[invitationId] — revoking", () => {
  it("gates on the SAME claim as the mint, so the two verbs cannot drift apart", async () => {
    await revoke();

    expect(checkCasePermission).toHaveBeenCalledWith(
      ACTOR,
      CASE_ID,
      "case.invite_student",
      serverClient,
    );
  });

  it("hands the repository BOTH ids from the path", async () => {
    await revoke();

    expect(revokeCaseInvitation).toHaveBeenCalledWith(INVITATION_ID, CASE_ID, serverClient);
  });

  it("records invitation.revoked against the invitation, on the admin client", async () => {
    await revoke();

    const call = writeAuditEvent.mock.calls[0];
    if (call === undefined) throw new Error("writeAuditEvent was never called");
    const [db, input] = call;
    expect(db).toBe(adminClient);
    expect(input.action).toBe("invitation.revoked");
    expect(input.entityId).toBe(INVITATION_ID);
    expect(input.caseId).toBe(CASE_ID);
    expect(input.actorUserId).toBe(ACTOR);
  });

  it("returns 500 when the audit write fails — D12 applies to revocation too", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit down"));

    const response = await revoke();

    expect(response.status).toBe(500);
  });

  it("400s a malformed INVITATION id, not just a malformed case id", async () => {
    const response = await revoke(CASE_ID, "not-a-uuid");

    // Without this the value reaches Postgres as a `22P02` inside the UPDATE and surfaces
    // as a 500 the caller reads as an outage.
    expect(response.status).toBe(400);
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("refuses a body that asks for anything but revocation", async () => {
    // `accepted_at` is outside the client's grant entirely, which is what keeps acceptance
    // a server-side compare-and-swap for slice 2. Asking for it is a 422 at the door
    // rather than a confusing 42501 from the database.
    const response = await PATCH(patchRequest({ accepted: true }), {
      params: Promise.resolve({ caseId: CASE_ID, invitationId: INVITATION_ID }),
    });

    expect(response.status).toBe(422);
    expect(revokeCaseInvitation).not.toHaveBeenCalled();
  });

  it("refuses `{ revoked: false }` — un-revoking is not a verb this route has", async () => {
    // The `revoked_at` grant is BIDIRECTIONAL at the database: writing null un-revokes.
    // MV-152's policy carries the owner carve-out for exactly this reason, and the route
    // declines to offer the reverse at all.
    const response = await PATCH(patchRequest({ revoked: false }), {
      params: Promise.resolve({ caseId: CASE_ID, invitationId: INVITATION_ID }),
    });

    expect(response.status).toBe(422);
    expect(revokeCaseInvitation).not.toHaveBeenCalled();
  });

  it("401s an anonymous caller and reaches nothing", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await revoke();

    expect(response.status).toBe(401);
    expect(revokeCaseInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ["role-not-permitted", 403],
    ["not-assigned", 403],
    ["unknown-case", 404],
    ["lookup-failed", 500],
  ])("denies %s with %i and never reaches the repository", async (reason, status) => {
    checkCasePermission.mockResolvedValue(denyFor(reason));

    const response = await revoke();

    expect(response.status).toBe(status);
    expect(revokeCaseInvitation).not.toHaveBeenCalled();
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });

  it("maps a zero-row refusal to 403 without becoming an existence oracle", async () => {
    revokeCaseInvitation.mockResolvedValue({ ok: false, reason: "denied" });

    const response = await revoke();
    const body = (await response.json()) as Record<string, unknown>;

    // "The policy refused" and "no such invitation on this case" are deliberately the
    // same answer: telling them apart would confirm an id's existence in another tenant.
    expect(response.status).toBe(403);
    expect(body.reason).toBe("denied");
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });
});
