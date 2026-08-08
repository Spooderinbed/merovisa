import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The two Stage 3 write surfaces MV-169 ships — access-matrix cells 2 and 5
 * (spec §4) — asserted at the route, where the ordering lives.
 *
 * The property these exist to hold: **authorize, then read, then write.** Each
 * denial case asserts the route never reached the repository, which is what a
 * "load the row first, check the permission after" refactor breaks while every
 * happy-path test stays green.
 *
 * `requireOrgPermission`/`checkOrgPermission` are mocked because they are proven
 * against their own fixtures in `tests/cases/org-permissions.test.ts`; what is NOT
 * mocked is which permission the route asks for, and that is the assertion that
 * catches a route gating team management on `case.list`.
 */

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, from: vi.fn() }),
}));

const { checkOrgPermission } = vi.hoisted(() => ({ checkOrgPermission: vi.fn() }));
vi.mock("@/lib/cases/require-org-permission", () => ({ checkOrgPermission }));

const { getOrgMembership, applyMembershipChange, renameOrganization } = vi.hoisted(() => ({
  getOrgMembership: vi.fn(),
  applyMembershipChange: vi.fn(),
  renameOrganization: vi.fn(),
}));
vi.mock("@/lib/org/repo", () => ({ getOrgMembership, applyMembershipChange, renameOrganization }));

import { PATCH as patchOrg } from "@/app/api/org/[organizationId]/route";
import { PATCH as patchMember } from "@/app/api/org/[organizationId]/members/[membershipId]/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP = "22222222-2222-4222-8222-222222222222";
const ACTOR = "actor-user-id";

/** `checkOrgPermission` answers per claim, so a route asking the wrong one fails. */
function grant(claims: Partial<Record<string, boolean>>) {
  checkOrgPermission.mockImplementation(async (_actor: string, _org: string, permission: string) => ({
    decision: claims[permission]
      ? { allowed: true, requiredScope: "all-org", reason: null }
      : { allowed: false, requiredScope: null, reason: "role-not-permitted" },
    context: { actorUserId: _actor, organizationId: _org },
  }));
}

function patchOrgRequest(body: unknown) {
  return patchOrg(
    new Request(`http://localhost/api/org/${ORG}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ organizationId: ORG }) },
  );
}

function patchMemberRequest(body: unknown) {
  return patchMember(
    new Request(`http://localhost/api/org/${ORG}/members/${MEMBERSHIP}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ organizationId: ORG, membershipId: MEMBERSHIP }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  getOrgMembership.mockResolvedValue({
    ok: true,
    data: { id: MEMBERSHIP, userId: "target-user", role: "counsellor", status: "active" },
  });
  applyMembershipChange.mockResolvedValue({ ok: true });
  renameOrganization.mockResolvedValue({ ok: true });
});

describe("PATCH /api/org/[organizationId] — cell 2, owner-only settings", () => {
  it("renames for an owner", async () => {
    grant({ "org.settings": true });
    const response = await patchOrgRequest({ name: "Anadi Global", slug: "anadi-global" });
    expect(response.status).toBe(200);
    expect(renameOrganization).toHaveBeenCalledWith(
      ORG,
      { name: "Anadi Global", slug: "anadi-global" },
      expect.anything(),
    );
  });

  it("asks for org.settings, not org.manage — divergence #1 is the whole point", async () => {
    // An admin holds `org.manage` and NOT `org.settings`. A route that gated on
    // the wrong claim would let an admin rename the tenant, which is exactly what
    // `organizations_update_owner` refuses.
    grant({ "org.manage": true });
    const response = await patchOrgRequest({ name: "Anadi Global" });
    expect(response.status).toBe(403);
    expect(renameOrganization).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated caller before authorizing anything", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    grant({ "org.settings": true });
    expect((await patchOrgRequest({ name: "x" })).status).toBe(401);
    expect(checkOrgPermission).not.toHaveBeenCalled();
    expect(renameOrganization).not.toHaveBeenCalled();
  });

  it("422s a body that is empty, malformed, or names a column outside the grant", async () => {
    grant({ "org.settings": true });
    for (const body of [
      {},
      { name: "" },
      { slug: "Not A Slug" },
      { slug: "-leading" },
      { status: "suspended" },
      { id: "another-org" },
    ]) {
      const response = await patchOrgRequest(body);
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
    expect(renameOrganization).not.toHaveBeenCalled();
  });

  it("409s a slug another tenant already holds", async () => {
    grant({ "org.settings": true });
    renameOrganization.mockResolvedValue({ ok: false, reason: "slug-taken" });
    expect((await patchOrgRequest({ slug: "taken" })).status).toBe(409);
  });

  it("403s — never 200 — when the database refused the write", async () => {
    // The read-back said zero rows. Reporting that as success is the defect.
    grant({ "org.settings": true });
    renameOrganization.mockResolvedValue({ ok: false, reason: "denied" });
    expect((await patchOrgRequest({ name: "x" })).status).toBe(403);
  });
});

describe("PATCH /api/org/[organizationId]/members/[membershipId] — cell 5", () => {
  it("changes a counsellor's role for an admin", async () => {
    grant({ "org.manage": true });
    const response = await patchMemberRequest({ role: "admin" });
    expect(response.status).toBe(200);
    expect(applyMembershipChange).toHaveBeenCalledWith(ORG, MEMBERSHIP, { role: "admin" }, expect.anything());
  });

  it("403s a counsellor, and never reads the membership row", async () => {
    grant({});
    const response = await patchMemberRequest({ role: "admin" });
    expect(response.status).toBe(403);
    expect(getOrgMembership).not.toHaveBeenCalled();
    expect(applyMembershipChange).not.toHaveBeenCalled();
  });

  it("refuses an admin promoting someone to owner, and allows the owner to", async () => {
    grant({ "org.manage": true });
    expect((await patchMemberRequest({ role: "owner" })).status).toBe(403);
    expect(applyMembershipChange).not.toHaveBeenCalled();

    grant({ "org.manage": true, "org.settings": true });
    expect((await patchMemberRequest({ role: "owner" })).status).toBe(200);
  });

  it("refuses an admin touching the OWNER's row — the USING horn", async () => {
    grant({ "org.manage": true });
    getOrgMembership.mockResolvedValue({
      ok: true,
      data: { id: MEMBERSHIP, userId: "the-owner", role: "owner", status: "active" },
    });
    expect((await patchMemberRequest({ status: "inactive" })).status).toBe(403);
    expect(applyMembershipChange).not.toHaveBeenCalled();
  });

  it("refuses an actor changing their own membership — the lockout guard", async () => {
    grant({ "org.manage": true, "org.settings": true });
    getOrgMembership.mockResolvedValue({
      ok: true,
      data: { id: MEMBERSHIP, userId: ACTOR, role: "owner", status: "active" },
    });
    expect((await patchMemberRequest({ status: "inactive" })).status).toBe(403);
    expect(applyMembershipChange).not.toHaveBeenCalled();
  });

  it("404s a membership id that is not in this organization", async () => {
    grant({ "org.manage": true });
    getOrgMembership.mockResolvedValue({ ok: true, data: null });
    expect((await patchMemberRequest({ role: "admin" })).status).toBe(404);
    expect(applyMembershipChange).not.toHaveBeenCalled();
  });

  it("422s a body outside {role, status}", async () => {
    grant({ "org.manage": true });
    for (const body of [{}, { role: "student" }, { status: "pending" }, { user_id: "someone" }]) {
      expect((await patchMemberRequest(body)).status, JSON.stringify(body)).toBe(422);
    }
    expect(applyMembershipChange).not.toHaveBeenCalled();
  });

  it("403s — never 200 — when the database refused the write", async () => {
    grant({ "org.manage": true });
    applyMembershipChange.mockResolvedValue({ ok: false, reason: "denied" });
    expect((await patchMemberRequest({ role: "admin" })).status).toBe(403);
  });

  it("500s a failed lookup rather than treating it as 'no such member'", async () => {
    grant({ "org.manage": true });
    getOrgMembership.mockResolvedValue({ ok: false, reason: "lookup-failed" });
    expect((await patchMemberRequest({ role: "admin" })).status).toBe(500);
    expect(applyMembershipChange).not.toHaveBeenCalled();
  });
});
