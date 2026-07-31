import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CASE_PERMISSIONS,
  CASE_SCOPED_PERMISSIONS,
  ORG_SCOPED_PERMISSIONS,
  decideOrgPermission,
  deriveOrgStanding,
  type CaseRole,
  type OrgScopedPermission,
} from "@/lib/cases/permissions";
import { getOrgContext } from "@/lib/cases/org-context";
import {
  OrgAuthorizationError,
  checkOrgPermission,
  requireOrgPermission,
} from "@/lib/cases/require-org-permission";
import { fakeCaseDb, sawQuery, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

/**
 * The org-scoped half of the boundary.
 *
 * `case.list`, `case.create`, `org.audit.read`, `org.manage` and `org.settings`
 * are questions about an ORGANIZATION, not about one case — "may this actor
 * create a case?" has no case id to hand, and `requireCasePermission` denies with
 * "unknown-case" when no row matches. Shipping those five claims with no caller
 * able to check them was the defect this file closes.
 */

const ORG_A = "org-a";
const ORG_B = "org-b";
const OWNER_A = "user-owner-a";
const ADMIN_A = "user-admin-a";
const COUNSELLOR_A = "user-counsellor-a";
const REVOKED_ADMIN_A = "user-admin-revoked-a";
const OWNER_B = "user-owner-b";
const STUDENT = "user-student";

const FIXTURE: CaseDbFixture = {
  organization_memberships: [
    { organization_id: ORG_A, user_id: OWNER_A, role: "owner", status: "active" },
    { organization_id: ORG_A, user_id: ADMIN_A, role: "admin", status: "active" },
    { organization_id: ORG_A, user_id: COUNSELLOR_A, role: "counsellor", status: "active" },
    { organization_id: ORG_A, user_id: REVOKED_ADMIN_A, role: "admin", status: "inactive" },
    { organization_id: ORG_B, user_id: OWNER_B, role: "owner", status: "active" },
  ],
};

function db(overrides?: Parameters<typeof fakeCaseDb>[1]) {
  return fakeCaseDb(FIXTURE, overrides);
}

function orgFacts(role: CaseRole | null, status: "active" | "inactive" | null = "active") {
  return { membershipRole: role, membershipStatus: status };
}

describe("the org/case split — every claim is checkable through exactly one entry point", () => {
  test("the two sets partition the 13 claims, with no overlap and nothing dropped", () => {
    const union = [...ORG_SCOPED_PERMISSIONS, ...CASE_SCOPED_PERMISSIONS];
    expect(new Set(union).size, "a claim appears in both sets").toBe(union.length);
    expect([...union].sort()).toEqual([...CASE_PERMISSIONS].sort());
  });

  test("the org-scoped set is exactly the five the caseId entry point cannot serve", () => {
    expect([...ORG_SCOPED_PERMISSIONS]).toEqual([
      "case.list",
      "case.create",
      "org.audit.read",
      "org.manage",
      "org.settings",
    ]);
  });

  test("a case-scoped claim cast into the org entry point is refused, not answered", () => {
    // The types keep these apart; this is the runtime half, so a cast cannot
    // borrow an org membership to answer a question about one case.
    const decision = decideOrgPermission("case.read" as OrgScopedPermission, orgFacts("owner"));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("unknown-permission");
  });
});

describe("decideOrgPermission — the pure org decision", () => {
  test("an active owner holds all five org-scoped claims", () => {
    for (const permission of ORG_SCOPED_PERMISSIONS) {
      expect(decideOrgPermission(permission, orgFacts("owner")).allowed, permission).toBe(true);
    }
  });

  test("an active admin holds four — org.settings stays with the owner", () => {
    for (const permission of ["case.list", "case.create", "org.audit.read", "org.manage"] as const) {
      expect(decideOrgPermission(permission, orgFacts("admin")).allowed, permission).toBe(true);
    }
    const settings = decideOrgPermission("org.settings", orgFacts("admin"));
    expect(settings.allowed).toBe(false);
    expect(settings.reason).toBe("role-not-permitted");
  });

  test("a counsellor may list, and the allowed scope says the list is theirs only", () => {
    // The scope IS the answer: "assigned" tells the caller to filter the list to
    // the actor's case_assignments rows. An allow here is not an allow to see
    // every case in the organization.
    const decision = decideOrgPermission("case.list", orgFacts("counsellor"));
    expect(decision.allowed).toBe(true);
    expect(decision.requiredScope).toBe("assigned");
  });

  test("a counsellor may not create cases, read the audit trail, or manage the org", () => {
    for (const permission of ["case.create", "org.audit.read", "org.manage", "org.settings"] as const) {
      const decision = decideOrgPermission(permission, orgFacts("counsellor"));
      expect(decision.allowed, permission).toBe(false);
      expect(decision.reason).toBe("role-not-permitted");
    }
  });

  test("an inactive membership holds nothing — the org half of the dual-role rule", () => {
    for (const permission of ORG_SCOPED_PERMISSIONS) {
      const decision = decideOrgPermission(permission, orgFacts("owner", "inactive"));
      expect(decision.allowed, permission).toBe(false);
      expect(decision.reason).toBe("membership-inactive");
    }
  });

  test("no membership row means no relationship to the organization", () => {
    const decision = decideOrgPermission("case.list", orgFacts(null, null));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("no-relationship");
  });

  test("a role the migration does not define, and 'student', grant nothing", () => {
    // organization_memberships.role excludes 'student' by check constraint — a
    // row carrying it is drift, and drift is never an org right.
    for (const role of ["superuser" as CaseRole, "student" as CaseRole]) {
      const decision = decideOrgPermission("org.manage", orgFacts(role));
      expect(decision.allowed, role).toBe(false);
      expect(decision.reason).toBe("unknown-role");
    }
  });

  test("a status the migration does not define denies", () => {
    const decision = decideOrgPermission(
      "case.list",
      orgFacts("owner", "pending" as "active"),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("membership-inactive");
  });

  test("deriveOrgStanding is the single place the gate conditions live", () => {
    expect(deriveOrgStanding(orgFacts("admin"))).toEqual({ isActiveMember: true, reason: null });
    expect(deriveOrgStanding(orgFacts("admin", "inactive"))).toEqual({
      isActiveMember: false,
      reason: "membership-inactive",
    });
    expect(deriveOrgStanding(orgFacts(null, null))).toEqual({
      isActiveMember: false,
      reason: "no-relationship",
    });
  });
});

describe("getOrgContext — resolved from the database only", () => {
  test("an active member resolves to their membership role and standing", async () => {
    const { client } = db();
    const context = await getOrgContext(ADMIN_A, ORG_A, client);
    expect(context).toMatchObject({
      actorUserId: ADMIN_A,
      organizationId: ORG_A,
      membershipRole: "admin",
      membershipStatus: "active",
      isActiveMember: true,
      denyReason: null,
      hasAccess: true,
    });
  });

  test("the query filters on BOTH the org and the actor", async () => {
    const { client, queries } = db();
    await getOrgContext(ADMIN_A, ORG_A, client);
    expect(
      sawQuery(queries, "organization_memberships", [
        ["organization_id", ORG_A],
        ["user_id", ADMIN_A],
      ]),
    ).toBe(true);
  });

  test("an owner of another organization has no standing here", async () => {
    const { client } = db();
    const context = await getOrgContext(OWNER_B, ORG_A, client);
    expect(context.membershipRole).toBeNull();
    expect(context.hasAccess).toBe(false);
    expect(context.denyReason).toBe("no-relationship");
  });

  test("a revoked member has no standing, and the facts stay faithful", async () => {
    const { client } = db();
    const context = await getOrgContext(REVOKED_ADMIN_A, ORG_A, client);
    expect(context.membershipRole).toBe("admin");
    expect(context.membershipStatus).toBe("inactive");
    expect(context.isActiveMember).toBe(false);
    expect(context.denyReason).toBe("membership-inactive");
  });

  test("a student — who holds no membership row anywhere — has no org standing", async () => {
    const { client } = db();
    const context = await getOrgContext(STUDENT, ORG_A, client);
    expect(context.hasAccess).toBe(false);
    expect(context.denyReason).toBe("no-relationship");
  });

  test("an unknown organization is indistinguishable from not being a member", async () => {
    // Deliberate: no `organizations` existence probe. Under RLS a non-member
    // cannot read the organizations row either, so a probe would answer "unknown"
    // for both — while handing an outsider an org-enumeration oracle.
    const { client, queries } = db();
    const context = await getOrgContext(OWNER_A, "org-does-not-exist", client);
    expect(context.hasAccess).toBe(false);
    expect(context.denyReason).toBe("no-relationship");
    expect(queries.every((query) => query.table === "organization_memberships")).toBe(true);
  });

  test("a blank identifier denies without querying", async () => {
    const { client, queries } = db();
    for (const [actor, org] of [["", ORG_A], [OWNER_A, ""], ["  ", ORG_A]] as const) {
      const context = await getOrgContext(actor, org, client);
      expect(context.denyReason).toBe("invalid-input");
      expect(context.hasAccess).toBe(false);
    }
    expect(queries).toHaveLength(0);
  });

  test("a PostgREST error denies with lookup-failed, never a partial context", async () => {
    const { client } = db({ errorOn: { organization_memberships: { message: "boom" } } });
    const context = await getOrgContext(OWNER_A, ORG_A, client);
    expect(context.membershipRole).toBeNull();
    expect(context.hasAccess).toBe(false);
    expect(context.denyReason).toBe("lookup-failed");
  });

  test("a thrown client is caught and denied, not propagated", async () => {
    const { client } = db({ throwOn: ["organization_memberships"] });
    await expect(getOrgContext(OWNER_A, ORG_A, client)).resolves.toMatchObject({
      hasAccess: false,
      denyReason: "lookup-failed",
    });
  });

  test("a client missing `from` entirely denies rather than crashing the request", async () => {
    const broken = {} as Parameters<typeof getOrgContext>[2];
    const context = await getOrgContext(OWNER_A, ORG_A, broken);
    expect(context.denyReason).toBe("lookup-failed");
  });
});

describe("requireOrgPermission / checkOrgPermission", () => {
  test("an owner passes and receives the resolved org context", async () => {
    const { client } = db();
    const context = await requireOrgPermission(OWNER_A, ORG_A, "org.settings", client);
    expect(context.membershipRole).toBe("owner");
    expect(context.isActiveMember).toBe(true);
  });

  test("every denial throws the typed error, carrying the org and the reason", async () => {
    const { client } = db();
    const error = await requireOrgPermission(ADMIN_A, ORG_A, "org.settings", client).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(OrgAuthorizationError);
    const authError = error as OrgAuthorizationError;
    expect(authError.name).toBe("OrgAuthorizationError");
    expect(authError.organizationId).toBe(ORG_A);
    expect(authError.permission).toBe("org.settings");
    expect(authError.reason).toBe("role-not-permitted");
    // Callers may log or bubble this; it must carry no identifiers.
    expect(authError.message).not.toContain(ADMIN_A);
    expect(authError.message).not.toContain(ORG_A);
  });

  test("a revoked member is denied every org-scoped claim", async () => {
    const { client } = db();
    for (const permission of ORG_SCOPED_PERMISSIONS) {
      const error = await requireOrgPermission(REVOKED_ADMIN_A, ORG_A, permission, client).then(
        () => null,
        (thrown: unknown) => thrown,
      );
      expect(error, permission).toBeInstanceOf(OrgAuthorizationError);
      expect((error as OrgAuthorizationError).reason).toBe("membership-inactive");
    }
  });

  test("cross-tenant reach is denied — an owner of B cannot create a case in A", async () => {
    const { client } = db();
    await expect(requireOrgPermission(OWNER_B, ORG_A, "case.create", client)).rejects.toBeInstanceOf(
      OrgAuthorizationError,
    );
  });

  test("checkOrgPermission never throws and agrees with require on every claim", async () => {
    for (const actor of [OWNER_A, ADMIN_A, COUNSELLOR_A, REVOKED_ADMIN_A, OWNER_B, STUDENT]) {
      for (const permission of ORG_SCOPED_PERMISSIONS) {
        const { decision } = await checkOrgPermission(actor, ORG_A, permission, db().client);
        const threw = await requireOrgPermission(actor, ORG_A, permission, db().client).then(
          () => false,
          () => true,
        );
        expect(threw, `${actor} × ${permission}`).toBe(!decision.allowed);
      }
    }
  });

  test("there is no caller-supplied role argument to forge", async () => {
    // Same structural guarantee as the case entry point: (actor, org, claim, db).
    expect(requireOrgPermission.length).toBe(4);
    expect(checkOrgPermission.length).toBe(4);

    const { from } = db();
    const getUser = vi.fn();
    const getSession = vi.fn();
    const clientWithForgedSession = { from, auth: { getUser, getSession } } as never;
    await expect(
      requireOrgPermission(COUNSELLOR_A, ORG_A, "org.manage", clientWithForgedSession),
    ).rejects.toBeInstanceOf(OrgAuthorizationError);
    expect(getUser).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });
});
