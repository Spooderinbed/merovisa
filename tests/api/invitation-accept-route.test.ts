import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * MV-194 — the acceptance route, where the ORDERING lives (Stage 5 slice 2).
 *
 * The properties this file holds, none of which the repository can hold on its own:
 *
 *  * **The token rides in a POST BODY, never in the URL.** The student's inbound link is
 *    the one place the plaintext is allowed to be a path segment; the acceptance itself is
 *    a POST, so the credential never enters a second URL, a redirect, or an access log.
 *  * **The swap decides, then the audit row commits, then the link lands.** That order is
 *    the card's position and it is load-bearing in both directions — see the route header.
 *  * **No 2xx without the audit row** (MV-189, D12).
 *  * **A failed acceptance writes no success event** (criterion 8).
 *  * **Every refusal keeps its own status**, so the four gate words are distinguishable
 *    from outside the process (criterion 4).
 *  * **Nothing in any response body carries the token** (criterion 7).
 *
 * `redeemInvitationToken` and `linkCaseToStudent` are mocked because they are proven
 * against their own fixtures in `tests/invitations/accept.test.ts` and against a real
 * database in `tests/integration/stage5-invitations.itest.ts`. What is NOT mocked is the
 * order the route calls them in, or what it does between them.
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

const { checkRateLimit } = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit/upstash", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit/upstash")>(
    "@/lib/rate-limit/upstash",
  );
  return { ...actual, checkRateLimit };
});

const { redeemInvitationToken, linkCaseToStudent } = vi.hoisted(() => ({
  redeemInvitationToken: vi.fn(),
  linkCaseToStudent: vi.fn(),
}));
vi.mock("@/lib/invitations/accept", async () => {
  const actual = await vi.importActual<typeof import("@/lib/invitations/accept")>(
    "@/lib/invitations/accept",
  );
  return { ...actual, redeemInvitationToken, linkCaseToStudent };
});

const { writeAuditEvent } = vi.hoisted(() => ({
  writeAuditEvent: vi.fn(async (_db: unknown, _input: Record<string, unknown>) => {}),
}));
vi.mock("@/lib/audit/write-audit-event", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit/write-audit-event")>(
    "@/lib/audit/write-audit-event",
  );
  return { ...actual, writeAuditEvent };
});

import { POST } from "@/app/api/invitations/accept/route";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVITATION_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const EMAIL = "student@example.test";
/** 43 base64url characters, the shape `mintInvitationToken` produces. */
const TOKEN = "Zm9vYmFyLXRva2VuLXZhbHVlLW5vYm9keS1zZWVzLXh4";

function request(body: unknown): Request {
  return new Request("http://localhost/api/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const accept = (token: string = TOKEN) => POST(request({ token }));

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR, email: EMAIL } } });
  checkRateLimit.mockResolvedValue(true);
  redeemInvitationToken.mockResolvedValue({
    ok: true,
    outcome: "redeemed",
    invitationId: INVITATION_ID,
    caseId: CASE_ID,
    organizationId: ORG_ID,
  });
  linkCaseToStudent.mockResolvedValue({ ok: true });
  writeAuditEvent.mockResolvedValue(undefined);
});

// =======================================================================================
// The happy path, and the order it happens in
// =======================================================================================
describe("POST /api/invitations/accept — a valid token", () => {
  it("redeems, audits, links, and answers 200 with the case it joined", async () => {
    const response = await accept();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; caseId: string };
    expect(body.ok).toBe(true);
    expect(body.caseId).toBe(CASE_ID);
  });

  it("hands the repository the token from the BODY and the actor from the SESSION", async () => {
    await accept();

    expect(redeemInvitationToken).toHaveBeenCalledTimes(1);
    const [, input] = redeemInvitationToken.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input.token).toBe(TOKEN);
    // Never a caller-supplied id or address. A route that took either would let anyone
    // holding a token accept it on somebody else's behalf, which is the entire authority
    // this slice creates.
    expect(input.actorUserId).toBe(ACTOR);
    expect(input.actorEmail).toBe(EMAIL);
  });

  it("uses the SERVICE-ROLE client — the two writes are in no `authenticated` grant", async () => {
    await accept();

    expect(createSupabaseAdminClient).toHaveBeenCalled();
    expect(redeemInvitationToken.mock.calls[0]![0]).toBe(adminClient);
    expect(linkCaseToStudent.mock.calls[0]![0]).toBe(adminClient);
  });

  it("writes `invitation.accepted` with no student detail in metadata", async () => {
    await accept();

    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
    const [db, input] = writeAuditEvent.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(db).toBe(adminClient);
    expect(input.action).toBe("invitation.accepted");
    expect(input.actorUserId).toBe(ACTOR);
    expect(input.caseId).toBe(CASE_ID);
    expect(input.organizationId).toBe(ORG_ID);
    expect(input.entityType).toBe("invitation");
    expect(input.entityId).toBe(INVITATION_ID);
    // D13 — the invited address is raw student detail and `entity_id` already names the
    // row. MV-193 carried no metadata on either of its events for the same reason.
    expect(input.metadata).toBeUndefined();
  });

  it("AUDITS BEFORE IT LINKS — the swap is the event, the link is its consequence", async () => {
    const order: string[] = [];
    redeemInvitationToken.mockImplementation(async () => {
      order.push("redeem");
      return { ok: true, outcome: "redeemed", invitationId: INVITATION_ID, caseId: CASE_ID, organizationId: ORG_ID };
    });
    writeAuditEvent.mockImplementation(async () => {
      order.push("audit");
    });
    linkCaseToStudent.mockImplementation(async () => {
      order.push("link");
      return { ok: true };
    });

    await accept();

    // Auditing after the link would leave the burned-token-without-a-link state — the one
    // failure the card asks to be made loud — with no record of it at all.
    expect(order).toEqual(["redeem", "audit", "link"]);
  });

  it("rate-limits per account, after authenticating", async () => {
    checkRateLimit.mockResolvedValue(false);

    const response = await accept();

    expect(response.status).toBe(429);
    expect(redeemInvitationToken).not.toHaveBeenCalled();
  });
});

// =======================================================================================
// Decision C
// =======================================================================================
describe("POST /api/invitations/accept — decision C, the same student's second click", () => {
  it("answers 200 and lands them in the case rather than on an error", async () => {
    redeemInvitationToken.mockResolvedValue({ ok: true, outcome: "already-yours", caseId: CASE_ID });

    const response = await accept();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; caseId: string; alreadyLinked: boolean };
    expect(body.caseId).toBe(CASE_ID);
    expect(body.alreadyLinked).toBe(true);
  });

  it("writes NO second audit event and issues NO second link — nothing changed", async () => {
    redeemInvitationToken.mockResolvedValue({ ok: true, outcome: "already-yours", caseId: CASE_ID });

    await accept();

    expect(writeAuditEvent).not.toHaveBeenCalled();
    expect(linkCaseToStudent).not.toHaveBeenCalled();
  });
});

// =======================================================================================
// The refusals — criterion 4, from outside the process
// =======================================================================================
describe("POST /api/invitations/accept — the four gate words are distinguishable", () => {
  it.each([
    ["invalid-token", 404],
    ["email-mismatch", 403],
    ["already-accepted", 409],
    ["revoked", 409],
    // 410 Gone, and precisely: the credential existed and no longer does. A 404 would tell
    // the student to check their link, which is not the thing that is wrong.
    ["expired", 410],
    ["invalid-input", 400],
    ["redeem-failed", 500],
  ])("%s answers %i", async (reason, status) => {
    redeemInvitationToken.mockResolvedValue({ ok: false, reason });

    const response = await accept();

    expect(response.status).toBe(status);
    const body = (await response.json()) as { reason?: string };
    expect(body.reason).toBe(reason);
  });

  it("the four gate words map to four DIFFERENT statuses", async () => {
    const statuses = new Map<string, number>();
    for (const reason of ["invalid-token", "email-mismatch", "expired", "revoked"]) {
      redeemInvitationToken.mockResolvedValue({ ok: false, reason });
      statuses.set(reason, (await accept()).status);
    }
    // `revoked` and `already-accepted` deliberately share 409 — both are "this link has
    // already been dealt with". The four EXIT-GATE words do not share one.
    expect(new Set(statuses.values()).size).toBe(4);
  });

  it("no refusal writes a success event — criterion 8", async () => {
    for (const reason of ["invalid-token", "email-mismatch", "expired", "revoked", "already-accepted", "redeem-failed"]) {
      vi.clearAllMocks();
      getUser.mockResolvedValue({ data: { user: { id: ACTOR, email: EMAIL } } });
      checkRateLimit.mockResolvedValue(true);
      redeemInvitationToken.mockResolvedValue({ ok: false, reason });

      await accept();

      expect(writeAuditEvent, `\`${reason}\` wrote an audit row`).not.toHaveBeenCalled();
      expect(linkCaseToStudent, `\`${reason}\` still tried to link`).not.toHaveBeenCalled();
    }
  });

  it("no refusal reveals whose case it was or which consultancy minted it", async () => {
    for (const reason of ["invalid-token", "email-mismatch", "expired", "revoked", "already-accepted"]) {
      redeemInvitationToken.mockResolvedValue({ ok: false, reason });

      const text = await (await accept()).text();

      expect(text, `\`${reason}\` leaked a case id`).not.toContain(CASE_ID);
      expect(text, `\`${reason}\` leaked an organization id`).not.toContain(ORG_ID);
      expect(text, `\`${reason}\` leaked an invitation id`).not.toContain(INVITATION_ID);
    }
  });
});

// =======================================================================================
// The atomicity gap, made loud
// =======================================================================================
describe("POST /api/invitations/accept — a link that does not land is never a silent 200", () => {
  it("decision D: a case already held by another student answers 409, not 200", async () => {
    linkCaseToStudent.mockResolvedValue({ ok: false, reason: "case-already-linked" });

    const response = await accept();

    expect(response.status).toBe(409);
    const body = (await response.json()) as { reason?: string; ok?: boolean };
    expect(body.reason).toBe("case-already-linked");
    expect(body.ok).toBeUndefined();
  });

  it("a link that failed outright answers 500", async () => {
    linkCaseToStudent.mockResolvedValue({ ok: false, reason: "link-failed" });

    expect((await accept()).status).toBe(500);
  });

  it("the audit row still names the burned token — the failure is RECORDED, not invisible", async () => {
    linkCaseToStudent.mockResolvedValue({ ok: false, reason: "link-failed" });

    await accept();

    // The swap committed, so the token IS spent. Auditing before the link is what makes
    // that spend evidence rather than a gap between two writes nobody can see.
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
    const [, input] = writeAuditEvent.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input.entityId).toBe(INVITATION_ID);
  });

  it("a failed audit is a 500 and the link is NEVER attempted — D12", async () => {
    writeAuditEvent.mockRejectedValue(new Error("audit write failed"));

    const response = await accept();

    expect(response.status).toBe(500);
    expect(linkCaseToStudent).not.toHaveBeenCalled();
  });
});

// =======================================================================================
// The request surface
// =======================================================================================
describe("POST /api/invitations/accept — the request itself", () => {
  it("401s an unauthenticated caller, before any client or query", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await accept();

    expect(response.status).toBe(401);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(redeemInvitationToken).not.toHaveBeenCalled();
  });

  it("refuses an account with no email address rather than guessing one", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ACTOR, email: null } } });

    const response = await accept();

    expect(response.status).toBe(403);
    expect((await response.json() as { reason?: string }).reason).toBe("no-account-email");
    expect(redeemInvitationToken).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing token", {}],
    ["an empty token", { token: "" }],
    ["a token carrying a path separator", { token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bbbb" }],
    ["a token carrying a query separator", { token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?bbbb" }],
    ["a comically long token", { token: "a".repeat(5000) }],
    ["an unexpected key", { token: TOKEN, caseId: CASE_ID }],
  ])("422s %s without touching the database", async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(422);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(redeemInvitationToken).not.toHaveBeenCalled();
  });

  it("400s malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("NO response body ever carries the token — criterion 7", async () => {
    const bodies: string[] = [];

    bodies.push(await (await accept()).text());

    redeemInvitationToken.mockResolvedValue({ ok: true, outcome: "already-yours", caseId: CASE_ID });
    bodies.push(await (await accept()).text());

    for (const reason of ["invalid-token", "email-mismatch", "expired", "revoked", "already-accepted", "redeem-failed", "invalid-input"]) {
      redeemInvitationToken.mockResolvedValue({ ok: false, reason });
      bodies.push(await (await accept()).text());
    }
    bodies.push(await (await POST(request({ token: "" }))).text());

    // The control: the sweep can see something. An empty body list would satisfy the loop
    // below against a route that echoed the token in every response.
    expect(bodies.filter((b) => b.length > 0).length).toBeGreaterThan(8);
    for (const body of bodies) {
      expect(body, "a response body echoed the invitation token").not.toContain(TOKEN);
    }
  });

  it("never sets a Location header — the token must not ride in a redirect", async () => {
    const response = await accept();

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBeLessThan(300);
  });
});
