import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getCaseContext } from "@/lib/cases/context";
import { decideCasePermission } from "@/lib/cases/permissions";
import { fakeCaseDb, sawQuery, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

// Two organizations, a staff member in every role, and cases on both sides of the
// tenant boundary — the fixture shape MV-153 will mint for real.
const ORG_A = "org-a";
const ORG_B = "org-b";
const OWNER_A = "user-owner-a";
const ADMIN_A = "user-admin-a";
const ASSIGNED_COUNSELLOR_A = "user-counsellor-assigned-a";
const OTHER_COUNSELLOR_A = "user-counsellor-unassigned-a";
const REVOKED_COUNSELLOR_A = "user-counsellor-revoked-a";
const OWNER_B = "user-owner-b";
const STUDENT_A1 = "user-student-a1";
const STRANGER = "user-stranger";
// Two dual-role actors: staff of ORG_A who are ALSO the linked student of one of
// its cases. The awkward shape the canonical matrix settles.
const STAFF_STUDENT_A = "user-counsellor-and-student-a";
const REVOKED_STAFF_STUDENT_A = "user-counsellor-revoked-and-student-a";
const CASE_A1 = "case-a1";
const CASE_A2 = "case-a2";
const CASE_A3 = "case-a3";
const CASE_A4 = "case-a4";
const CASE_B1 = "case-b1";
const PERSONAL_CASE = "case-personal";

const FIXTURE: CaseDbFixture = {
  organizations: [
    { id: ORG_A, name: "Consultancy A", slug: "consultancy-a", status: "active" },
    { id: ORG_B, name: "Consultancy B", slug: "consultancy-b", status: "active" },
  ],
  cases: [
    { id: CASE_A1, organization_id: ORG_A, student_user_id: STUDENT_A1, display_name: "Case A1" },
    { id: CASE_A2, organization_id: ORG_A, student_user_id: null, display_name: "Case A2 (unclaimed)" },
    { id: CASE_B1, organization_id: ORG_B, student_user_id: null, display_name: "Case B1" },
    // The dual-role cases: an org case whose linked student is also staff.
    { id: CASE_A3, organization_id: ORG_A, student_user_id: STAFF_STUDENT_A, display_name: "Case A3" },
    { id: CASE_A4, organization_id: ORG_A, student_user_id: REVOKED_STAFF_STUDENT_A, display_name: "Case A4" },
    // A personal case: no organization, an individual using MeroVisa directly.
    { id: PERSONAL_CASE, organization_id: null, student_user_id: STUDENT_A1, display_name: "Personal" },
  ],
  organization_memberships: [
    { organization_id: ORG_A, user_id: OWNER_A, role: "owner", status: "active" },
    { organization_id: ORG_A, user_id: ADMIN_A, role: "admin", status: "active" },
    { organization_id: ORG_A, user_id: ASSIGNED_COUNSELLOR_A, role: "counsellor", status: "active" },
    { organization_id: ORG_A, user_id: OTHER_COUNSELLOR_A, role: "counsellor", status: "active" },
    { organization_id: ORG_A, user_id: REVOKED_COUNSELLOR_A, role: "counsellor", status: "inactive" },
    { organization_id: ORG_A, user_id: STAFF_STUDENT_A, role: "counsellor", status: "active" },
    { organization_id: ORG_A, user_id: REVOKED_STAFF_STUDENT_A, role: "counsellor", status: "inactive" },
    { organization_id: ORG_B, user_id: OWNER_B, role: "owner", status: "active" },
  ],
  case_assignments: [
    { case_id: CASE_A1, user_id: ASSIGNED_COUNSELLOR_A, assignment_role: "primary_counsellor" },
    // The revoked counsellor still holds a live assignment row: revocation flips
    // membership status, it does not delete history (migration lines 52-55).
    { case_id: CASE_A1, user_id: REVOKED_COUNSELLOR_A, assignment_role: "primary_counsellor" },
    { case_id: CASE_A1, user_id: STAFF_STUDENT_A, assignment_role: "primary_counsellor" },
    { case_id: CASE_A4, user_id: REVOKED_STAFF_STUDENT_A, assignment_role: "primary_counsellor" },
  ],
};

function db(overrides?: Parameters<typeof fakeCaseDb>[1]) {
  return fakeCaseDb(FIXTURE, overrides);
}

describe("getCaseContext — resolves facts from the database only", () => {
  test("an active owner of the case's organization gets whole-org scope", async () => {
    const { client } = db();
    const context = await getCaseContext(OWNER_A, CASE_A1, client);
    expect(context).toMatchObject({
      actorUserId: OWNER_A,
      caseId: CASE_A1,
      caseExists: true,
      isOrgCase: true,
      organizationId: ORG_A,
      membershipRole: "owner",
      membershipStatus: "active",
      isLinkedStudent: false,
      grantedRoles: ["owner"],
      accessScope: "all-org",
      denyReason: null,
      hasAccess: true,
    });
  });

  test("an active admin gets whole-org scope", async () => {
    const { client } = db();
    const context = await getCaseContext(ADMIN_A, CASE_A1, client);
    expect(context.membershipRole).toBe("admin");
    expect(context.accessScope).toBe("all-org");
    expect(context.hasAccess).toBe(true);
  });

  test("an assigned counsellor gets assigned scope and the assignment fact", async () => {
    const { client } = db();
    const context = await getCaseContext(ASSIGNED_COUNSELLOR_A, CASE_A1, client);
    expect(context.membershipRole).toBe("counsellor");
    expect(context.isAssignedToCase).toBe(true);
    expect(context.accessScope).toBe("assigned");
    expect(context.hasAccess).toBe(true);
  });

  test("a counsellor in the org but not assigned to this case gets no access", async () => {
    const { client } = db();
    const context = await getCaseContext(OTHER_COUNSELLOR_A, CASE_A1, client);
    expect(context.membershipRole).toBe("counsellor");
    expect(context.isAssignedToCase).toBe(false);
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("not-assigned");
    expect(context.hasAccess).toBe(false);
  });

  test("the linked student gets linked scope, with no membership row", async () => {
    const { client } = db();
    const context = await getCaseContext(STUDENT_A1, CASE_A1, client);
    // Student-ness never appears as a membership role — it is the case link.
    expect(context.membershipRole).toBeNull();
    expect(context.membershipStatus).toBeNull();
    expect(context.isLinkedStudent).toBe(true);
    expect(context.grantedRoles).toEqual(["student"]);
    expect(context.accessScope).toBe("linked");
    expect(context.hasAccess).toBe(true);
  });

  test("the queries filter on the actor, not only the case — knowing a case ID is not access", async () => {
    const { client, queries } = db();
    await getCaseContext(ASSIGNED_COUNSELLOR_A, CASE_A1, client);
    expect(sawQuery(queries, "cases", [["id", CASE_A1]])).toBe(true);
    expect(
      sawQuery(queries, "organization_memberships", [
        ["organization_id", ORG_A],
        ["user_id", ASSIGNED_COUNSELLOR_A],
      ]),
    ).toBe(true);
    expect(
      sawQuery(queries, "case_assignments", [
        ["case_id", CASE_A1],
        ["user_id", ASSIGNED_COUNSELLOR_A],
      ]),
    ).toBe(true);
  });
});

describe("getCaseContext — typed misses, never a partially-trusted context", () => {
  test("an unknown case yields a zeroed no-access context", async () => {
    const { client } = db();
    const context = await getCaseContext(OWNER_A, "case-does-not-exist", client);
    expect(context).toMatchObject({
      caseExists: false,
      isOrgCase: false,
      organizationId: null,
      membershipRole: null,
      membershipStatus: null,
      isAssignedToCase: false,
      isLinkedStudent: false,
      grantedRoles: [],
      accessScope: "deny",
      denyReason: "unknown-case",
      hasAccess: false,
    });
  });

  test("an actor with no relationship to the case gets no access", async () => {
    const { client } = db();
    const context = await getCaseContext(STRANGER, CASE_A1, client);
    expect(context.membershipRole).toBeNull();
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("no-relationship");
  });

  test("an owner of another organization cannot reach this case", async () => {
    const { client } = db();
    const context = await getCaseContext(OWNER_B, CASE_A1, client);
    expect(context.membershipRole).toBeNull();
    expect(context.membershipStatus).toBeNull();
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("no-relationship");
    expect(context.hasAccess).toBe(false);
  });

  test("this org's owner cannot reach the other org's case either — the fence cuts both ways", async () => {
    const { client } = db();
    const context = await getCaseContext(OWNER_A, CASE_B1, client);
    expect(context.accessScope).toBe("deny");
    expect(context.hasAccess).toBe(false);
  });

  test("a revoked membership loses access immediately, even with a live assignment row", async () => {
    const { client } = db();
    const context = await getCaseContext(REVOKED_COUNSELLOR_A, CASE_A1, client);
    // The facts stay faithful to the database — revocation is expressed by the
    // scope, not by pretending the assignment row vanished.
    expect(context.membershipStatus).toBe("inactive");
    expect(context.isAssignedToCase).toBe(true);
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("membership-inactive");
    expect(context.hasAccess).toBe(false);
  });

  test("a membership role the migration does not define yields no access", async () => {
    const { client } = fakeCaseDb({
      cases: [{ id: CASE_A1, organization_id: ORG_A, student_user_id: null }],
      organization_memberships: [
        { organization_id: ORG_A, user_id: STRANGER, role: "superuser", status: "active" },
      ],
    });
    const context = await getCaseContext(STRANGER, CASE_A1, client);
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("unknown-role");
    expect(context.hasAccess).toBe(false);
  });

  test("a membership status the migration does not define yields no access", async () => {
    const { client } = fakeCaseDb({
      cases: [{ id: CASE_A1, organization_id: ORG_A, student_user_id: null }],
      organization_memberships: [
        { organization_id: ORG_A, user_id: OWNER_A, role: "owner", status: "pending" },
      ],
    });
    const context = await getCaseContext(OWNER_A, CASE_A1, client);
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("membership-inactive");
  });

  test("an unclaimed case grants nothing to a would-be student", async () => {
    const { client } = db();
    const context = await getCaseContext(STUDENT_A1, CASE_A2, client);
    expect(context.isLinkedStudent).toBe(false);
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("no-relationship");
  });

  test("an empty or blank actor id or case id denies without querying", async () => {
    const { client, queries } = db();
    for (const [actor, caseId] of [
      ["", CASE_A1],
      [OWNER_A, ""],
      ["   ", CASE_A1],
    ] as const) {
      const context = await getCaseContext(actor, caseId, client);
      expect(context.accessScope).toBe("deny");
      expect(context.denyReason).toBe("invalid-input");
    }
    expect(queries).toHaveLength(0);
  });
});

describe("getCaseContext — the dual-role rule, end to end against the fixture", () => {
  test("staff who are also the linked student hold both roles on their own case", async () => {
    const { client } = db();
    const context = await getCaseContext(STAFF_STUDENT_A, CASE_A3, client);
    expect(context.membershipRole).toBe("counsellor");
    expect(context.isLinkedStudent).toBe(true);
    // Not assigned to CASE_A3 — the counsellor half contributes nothing HERE, so
    // they reach their own case as its student and no further.
    expect(context.isAssignedToCase).toBe(false);
    expect(context.grantedRoles).toEqual(["student"]);
    expect(context.accessScope).toBe("linked");
    expect(decideCasePermission("case.read", context).allowed).toBe(true);
    expect(decideCasePermission("case.notes.internal", context).allowed).toBe(false);
  });

  test("the same actor is still a full counsellor on the cases assigned to them", async () => {
    const { client } = db();
    const context = await getCaseContext(STAFF_STUDENT_A, CASE_A1, client);
    expect(context.isLinkedStudent).toBe(false);
    expect(context.grantedRoles).toEqual(["counsellor"]);
    expect(decideCasePermission("case.notes.internal", context).allowed).toBe(true);
  });

  test("REVOKING the membership does not take away their own student case", async () => {
    // The canonical rule: "revoking a membership never removes a person's rights
    // over their own student case." Before this fix the membership role masked
    // the student link and a fired counsellor lost their own case entirely.
    const { client } = db();
    const context = await getCaseContext(REVOKED_STAFF_STUDENT_A, CASE_A4, client);
    expect(context.membershipStatus).toBe("inactive");
    expect(context.isLinkedStudent).toBe(true);
    expect(context.grantedRoles).toEqual(["student"]);
    expect(context.accessScope).toBe("linked");
    expect(context.hasAccess).toBe(true);
    expect(decideCasePermission("case.read", context).allowed).toBe(true);
    expect(decideCasePermission("case.update", context).allowed).toBe(true);
  });

  test("…and takes away everything the membership carried", async () => {
    const { client } = db();
    const context = await getCaseContext(REVOKED_STAFF_STUDENT_A, CASE_A4, client);
    // Still assigned in the database — revocation flips status, not history.
    expect(context.isAssignedToCase).toBe(true);
    for (const permission of ["case.notes.internal", "case.export", "case.assign"] as const) {
      expect(decideCasePermission(permission, context).allowed, permission).toBe(false);
    }
  });

  test("a revoked member reaches no OTHER case in the org, student link or not", async () => {
    const { client } = db();
    const context = await getCaseContext(REVOKED_STAFF_STUDENT_A, CASE_A1, client);
    expect(context.grantedRoles).toEqual([]);
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("membership-inactive");
  });
});

describe("getCaseContext — personal cases", () => {
  test("the linked student of a personal case has linked scope", async () => {
    const { client } = db();
    const context = await getCaseContext(STUDENT_A1, PERSONAL_CASE, client);
    expect(context.isOrgCase).toBe(false);
    expect(context.organizationId).toBeNull();
    expect(context.caseExists).toBe(true);
    expect(context.membershipRole).toBeNull();
    expect(context.grantedRoles).toEqual(["student"]);
    expect(context.accessScope).toBe("linked");
    expect(context.hasAccess).toBe(true);
  });

  test("a consultancy owner has no access to a personal case", async () => {
    const { client } = db();
    const context = await getCaseContext(OWNER_A, PERSONAL_CASE, client);
    expect(context.membershipRole).toBeNull();
    expect(context.accessScope).toBe("deny");
    expect(context.hasAccess).toBe(false);
    expect(decideCasePermission("case.read", context).allowed).toBe(false);
  });

  test("no membership lookup is issued for a case with no organization", async () => {
    const { client, queries } = db();
    await getCaseContext(STUDENT_A1, PERSONAL_CASE, client);
    expect(queries.some((q) => q.table === "organization_memberships")).toBe(false);
  });
});

describe("getCaseContext — every failure resolves to deny, never a throw-through", () => {
  test("a PostgREST error on the cases lookup denies with lookup-failed", async () => {
    const { client } = db({ errorOn: { cases: { message: "permission denied for table cases" } } });
    const context = await getCaseContext(OWNER_A, CASE_A1, client);
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("lookup-failed");
    expect(context.hasAccess).toBe(false);
  });

  test("a PostgREST error on the membership lookup denies with lookup-failed", async () => {
    const { client } = db({ errorOn: { organization_memberships: { message: "boom" } } });
    const context = await getCaseContext(OWNER_A, CASE_A1, client);
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("lookup-failed");
    expect(context.membershipRole).toBeNull();
  });

  test("a PostgREST error on the assignment lookup denies with lookup-failed", async () => {
    const { client } = db({ errorOn: { case_assignments: { message: "boom" } } });
    const context = await getCaseContext(ASSIGNED_COUNSELLOR_A, CASE_A1, client);
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("lookup-failed");
  });

  test("a thrown client error is caught and denied, not propagated", async () => {
    const { client } = db({ throwOn: ["cases"] });
    await expect(getCaseContext(OWNER_A, CASE_A1, client)).resolves.toMatchObject({
      accessScope: "deny",
      denyReason: "lookup-failed",
      hasAccess: false,
    });
  });

  test("a client missing `from` entirely denies rather than crashing the request", async () => {
    const broken = {} as Parameters<typeof getCaseContext>[2];
    const context = await getCaseContext(OWNER_A, CASE_A1, broken);
    expect(context.accessScope).toBe("deny");
    expect(context.denyReason).toBe("lookup-failed");
  });

  test("an error never leaks a truthy scope even for an otherwise-permitted actor", async () => {
    const { client } = db({ errorOn: { cases: { message: "boom" } } });
    const context = await getCaseContext(OWNER_A, CASE_A1, client);
    for (const permission of ["case.read", "case.update", "case.export", "org.settings"] as const) {
      expect(decideCasePermission(permission, context).allowed).toBe(false);
    }
  });
});

describe("getCaseContext — role is DB-sourced, never asserted", () => {
  test("the context reads no auth session — the fake has no `auth` at all", async () => {
    const { client } = db();
    // If the implementation reached for `client.auth.getUser()` or session
    // metadata to learn the role, this would throw instead of resolving.
    await expect(getCaseContext(ASSIGNED_COUNSELLOR_A, CASE_A1, client)).resolves.toMatchObject({
      membershipRole: "counsellor",
    });
  });

  test("the resolved context feeds the pure matrix directly", async () => {
    const { client } = db();
    const owner = await getCaseContext(OWNER_A, CASE_A1, client);
    expect(decideCasePermission("case.export", owner).allowed).toBe(true);

    const counsellor = await getCaseContext(ASSIGNED_COUNSELLOR_A, CASE_A1, client);
    expect(decideCasePermission("case.read", counsellor).allowed).toBe(true);
    expect(decideCasePermission("case.export", counsellor).allowed).toBe(false);

    const student = await getCaseContext(STUDENT_A1, CASE_A1, client);
    expect(decideCasePermission("case.read", student).allowed).toBe(true);
    expect(decideCasePermission("case.notes.internal", student).allowed).toBe(false);
  });
});
