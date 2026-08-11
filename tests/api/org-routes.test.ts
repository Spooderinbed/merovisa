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

/**
 * `checkOrgPermission` answers per claim, so a route asking the wrong one fails.
 *
 * `true` allows; a STRING denies with that reason, so "the membership read
 * errored" can be told apart from "this role may not do this" — the distinction
 * `checkOrgPermission` preserves and these routes used to throw away.
 */
function grant(claims: Partial<Record<string, boolean | string>>) {
  checkOrgPermission.mockImplementation(async (_actor: string, _org: string, permission: string) => {
    const claim = claims[permission];
    return {
      decision:
        claim === true
          ? { allowed: true, requiredScope: "all-org", reason: null }
          : {
              allowed: false,
              requiredScope: null,
              reason: typeof claim === "string" ? claim : "role-not-permitted",
            },
      context: { actorUserId: _actor, organizationId: _org },
    };
  });
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
      // The only body here that actually exercises `.strict()`. Every case above
      // carries ONLY the ungranted key, so the trailing `.refine()` — "provide a
      // name or a slug" — refuses it first and `.strict()` is never reached:
      // measured, deleting `.strict()` from the route leaves all of them green.
      // This one satisfies the refine, so a schema that merely STRIPS `status`
      // returns 200 and tells the owner it saved a column outside
      // `grant update (name, slug)`.
      { name: "Anadi Global", status: "suspended" },
    ]) {
      const response = await patchOrgRequest(body);
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
    expect(renameOrganization).not.toHaveBeenCalled();
  });

  it("names the field it rejected, so the form can attribute the message", async () => {
    // `components/workspace/org-settings-form.tsx` reads `issues.fieldErrors` to
    // decide WHICH field to blame — it used to blame the web address for every
    // 422, including an empty organization name. Pinning the shape here rather
    // than only in a component fixture is the point: a fixture agrees with
    // itself, and a Zod upgrade that reshaped `flatten()` would leave the form
    // quietly mis-attributing again.
    grant({ "org.settings": true });
    const response = await patchOrgRequest({ name: "", slug: "anadi" });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { issues: { fieldErrors: Record<string, string[]> } };
    expect(Object.keys(body.issues.fieldErrors)).toEqual(["name"]);
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

  it("does NOT 403 a permission lookup that failed — that is an outage, not a refusal", async () => {
    // `getOrgContext` answers `lookup-failed` when the membership read errors —
    // a statement timeout, a dropped connection, a thrown client. The owner is
    // entitled to rename; nothing about their standing was established. A 403
    // tells them they lack permission and gives them nothing to retry.
    grant({ "org.settings": "lookup-failed" });
    const response = await patchOrgRequest({ name: "Anadi Global" });
    expect(response.status).toBe(503);
    expect(renameOrganization).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ reason: "lookup-failed" });
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

  it("does NOT 403 a failed org.manage lookup — that is an outage, not a refusal", async () => {
    grant({ "org.manage": "lookup-failed" });
    const response = await patchMemberRequest({ status: "inactive" });
    expect(response.status).toBe(503);
    expect(getOrgMembership).not.toHaveBeenCalled();
    expect(applyMembershipChange).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ reason: "lookup-failed" });
  });

  it("does NOT proceed as a non-owner when the org.settings lookup failed", async () => {
    // The second-order bug. `org.manage` answered, `org.settings` errored — so
    // `actorIsOwner` is false for an actor who may well BE the owner, and
    // `decideMembershipChange` then refuses with its own 403 ("only the owner may
    // grant ownership") that no longer mentions the outage at all. An owner is
    // told the rule refused them, when in fact nothing was ever checked.
    grant({ "org.manage": true, "org.settings": "lookup-failed" });
    const response = await patchMemberRequest({ role: "owner" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: "lookup-failed" });
    expect(applyMembershipChange).not.toHaveBeenCalled();
  });

  it("still treats an admin's honest lack of org.settings as a refusal, not an outage", async () => {
    // The guard above must key on the REASON. An admin is legitimately not the
    // owner; that denial is an answer, and 503ing it would tell every admin the
    // site is broken.
    grant({ "org.manage": true });
    expect((await patchMemberRequest({ role: "counsellor" })).status).toBe(200);
    expect((await patchMemberRequest({ role: "owner" })).status).toBe(403);
  });
});
