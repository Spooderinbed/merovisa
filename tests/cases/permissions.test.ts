import { describe, test, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

import {
  CASE_PERMISSIONS,
  CASE_PERMISSION_MATRIX,
  CASE_ROLES,
  MEMBERSHIP_ROLES,
  decideCasePermission,
  deriveAccessScope,
  deriveCaseGrants,
  scopeForRolePermission,
  type CaseAccessFacts,
  type CasePermission,
  type CaseRole,
  type PermissionScope,
} from "@/lib/cases/permissions";

// ---------------------------------------------------------------------------
// The card's grid, transcribed cell-for-cell so a reviewer can diff this table
// against docs/kanban/cards/MV-151-case-permission-boundary.md (Acceptance
// criteria) and against MV-152's policies. Column order: owner | admin |
// counsellor | student. "deny" is the card's "—".
// ---------------------------------------------------------------------------
const CARD_GRID: Array<
  [CasePermission, PermissionScope, PermissionScope, PermissionScope, PermissionScope]
> = [
  ["case.list", "all-org", "all-org", "assigned", "deny"],
  ["case.read", "all-org", "all-org", "assigned", "linked"],
  ["case.update", "all-org", "all-org", "assigned", "linked"],
  ["case.create", "all-org", "all-org", "deny", "deny"],
  ["case.assign", "all-org", "all-org", "deny", "deny"],
  ["case.invite_student", "all-org", "all-org", "assigned", "deny"],
  ["case.export", "all-org", "all-org", "deny", "deny"],
  ["case.archive", "all-org", "all-org", "deny", "deny"],
  ["case.delete", "all-org", "all-org", "deny", "deny"],
  ["case.notes.internal", "all-org", "all-org", "assigned", "deny"],
  // MV-182 — asking a case for a document is a CONSULTANCY verb, so it takes the
  // same column as `case.invite_student`: staff-shaped, assignment-scoped for a
  // counsellor, and `deny` for the student. Reading the resulting chase list is
  // NOT this claim — that rides `case.read`, which is why the student's cell here
  // being `deny` does not hide their own outstanding items from them.
  ["case.documents.request", "all-org", "all-org", "assigned", "deny"],
  ["org.audit.read", "all-org", "all-org", "deny", "deny"],
  ["org.manage", "all-org", "all-org", "deny", "deny"],
  ["org.settings", "all-org", "deny", "deny", "deny"],
];

const COLUMN_ROLES: CaseRole[] = ["owner", "admin", "counsellor", "student"];

/** Facts for an active staff member of the case's organization. */
function staffFacts(role: "owner" | "admin" | "counsellor", overrides: Partial<CaseAccessFacts> = {}): CaseAccessFacts {
  return {
    isOrgCase: true,
    membershipRole: role,
    membershipStatus: "active",
    isAssignedToCase: false,
    isLinkedStudent: false,
    ...overrides,
  };
}

/**
 * Facts for the student whose Auth user is linked to the case. There is no
 * `membershipRole: "student"` — student-ness IS the link, and a membership row
 * is what the actor is to the ORGANIZATION. Keeping the two in separate fields
 * is what makes the dual-role rule expressible at all.
 */
function studentFacts(overrides: Partial<CaseAccessFacts> = {}): CaseAccessFacts {
  return {
    isOrgCase: true,
    membershipRole: null,
    membershipStatus: null,
    isAssignedToCase: false,
    isLinkedStudent: true,
    ...overrides,
  };
}

describe("case permission matrix — the card grid, cell for cell", () => {
  test("the matrix covers exactly the 14 claims and 4 roles the card names", () => {
    expect(CASE_PERMISSIONS).toEqual(CARD_GRID.map(([permission]) => permission));
    expect(CASE_ROLES).toEqual(COLUMN_ROLES);
    // The DB check constraint deliberately excludes 'student' as a membership role
    // (20260730120000_stage1_tenancy_core.sql line 60) — students attach via
    // cases.student_user_id, never via a membership row.
    expect(MEMBERSHIP_ROLES).toEqual(["owner", "admin", "counsellor"]);
    expect(MEMBERSHIP_ROLES).not.toContain("student");
  });

  for (const [permission, ...scopes] of CARD_GRID) {
    for (const [index, role] of COLUMN_ROLES.entries()) {
      const expected = scopes[index];
      test(`${role} × ${permission} requires scope "${expected}"`, () => {
        expect(scopeForRolePermission(role, permission)).toBe(expected);
        expect(CASE_PERMISSION_MATRIX[role][permission]).toBe(expected);
      });
    }
  }
});

describe("owner and admin — whole-organization scope", () => {
  for (const [permission, ownerScope, adminScope] of CARD_GRID) {
    test(`active owner is allowed ${permission}`, () => {
      const decision = decideCasePermission(permission, staffFacts("owner"));
      expect(decision.allowed).toBe(ownerScope !== "deny");
    });

    test(`active admin ${adminScope === "deny" ? "is denied" : "is allowed"} ${permission}`, () => {
      const decision = decideCasePermission(permission, staffFacts("admin"));
      expect(decision.allowed).toBe(adminScope !== "deny");
    });
  }

  test("org.settings is owner-only — an active admin is denied", () => {
    expect(decideCasePermission("org.settings", staffFacts("owner")).allowed).toBe(true);
    const admin = decideCasePermission("org.settings", staffFacts("admin"));
    expect(admin.allowed).toBe(false);
    expect(admin.reason).toBe("role-not-permitted");
  });

  test("owner/admin do not need a case_assignments row for whole-org claims", () => {
    expect(decideCasePermission("case.read", staffFacts("owner", { isAssignedToCase: false })).allowed).toBe(true);
    expect(decideCasePermission("case.read", staffFacts("admin", { isAssignedToCase: false })).allowed).toBe(true);
  });

  test("a personal case (no organization) grants no whole-org access", () => {
    // Unreachable through getCaseContext (no organization_id ⇒ no membership lookup),
    // asserted anyway so the pure layer is fail-closed on its own.
    const decision = decideCasePermission("case.read", staffFacts("owner", { isOrgCase: false }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("scope-mismatch");
  });
});

describe("counsellor — assigned cases only", () => {
  test("assigned counsellor may read, update, invite the student, request documents, and use internal notes", () => {
    const facts = staffFacts("counsellor", { isAssignedToCase: true });
    for (const permission of [
      "case.read",
      "case.update",
      "case.invite_student",
      "case.documents.request",
      "case.notes.internal",
    ] as const) {
      expect(decideCasePermission(permission, facts).allowed).toBe(true);
    }
  });

  test("unassigned counsellor is denied every assigned-scope claim", () => {
    const facts = staffFacts("counsellor", { isAssignedToCase: false });
    for (const permission of [
      "case.read",
      "case.update",
      "case.invite_student",
      "case.documents.request",
      "case.notes.internal",
    ] as const) {
      const decision = decideCasePermission(permission, facts);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("not-assigned");
    }
  });

  test("counsellor is denied the owner/admin-only claims even when assigned", () => {
    const facts = staffFacts("counsellor", { isAssignedToCase: true });
    for (const permission of [
      "case.create",
      "case.assign",
      "case.export",
      "case.archive",
      "case.delete",
      "org.audit.read",
      "org.manage",
      "org.settings",
    ] as const) {
      const decision = decideCasePermission(permission, facts);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("role-not-permitted");
    }
  });
});

describe("student — only the case linked to their Auth user", () => {
  test("linked student may read and update their own case", () => {
    expect(decideCasePermission("case.read", studentFacts()).allowed).toBe(true);
    expect(decideCasePermission("case.update", studentFacts()).allowed).toBe(true);
  });

  test("an actor who is not the linked student holds no student claims", () => {
    // With `membershipRole` and `isLinkedStudent` as separate facts, "a student
    // who is not linked" is not a representable state — the link IS the role.
    // Losing the link means holding no relationship to the case at all.
    const facts = studentFacts({ isLinkedStudent: false });
    for (const permission of ["case.read", "case.update"] as const) {
      const decision = decideCasePermission(permission, facts);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("no-relationship");
    }
  });

  test("a student may NEVER read or write consultancy-internal notes", () => {
    const decision = decideCasePermission("case.notes.internal", studentFacts());
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("role-not-permitted");
  });

  test("a student is denied audit data, org management, listing, and export", () => {
    for (const permission of [
      "org.audit.read",
      "org.manage",
      "org.settings",
      "case.list",
      "case.create",
      "case.assign",
      "case.export",
      "case.archive",
      "case.delete",
      "case.invite_student",
    ] as const) {
      expect(decideCasePermission(permission, studentFacts()).allowed).toBe(false);
    }
  });

  /**
   * MV-182. The two halves of the student's relationship to a document request are
   * different claims, and stating only one of them would make the matrix lie in one
   * direction or the other:
   *
   *  - CREATE is a consultancy act. A student asking their own case for a document
   *    is not a thing the product does, and the database refuses it independently:
   *    the INSERT policy is `can_staff_case`, which is `can_access_case` MINUS the
   *    student disjunct precisely so the student's own link cannot launder them
   *    into the counsellor's chair on their own file.
   *  - READING the chase list is `case.read`, which the student holds at `linked`.
   *    So "the student is denied `case.documents.request`" must NOT be read as
   *    "the student cannot see what has been asked of them" — the Stage 5 surface
   *    that shows them is not built here, but the permission that will carry it
   *    already exists and already allows.
   */
  test("a student may not REQUEST a document, but the read that shows them one still allows", () => {
    const decision = decideCasePermission("case.documents.request", studentFacts());
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("role-not-permitted");

    expect(decideCasePermission("case.read", studentFacts()).allowed).toBe(true);
  });

  test("a linked student on a personal case keeps their linked-scope claims", () => {
    const facts = studentFacts({ isOrgCase: false });
    expect(decideCasePermission("case.read", facts).allowed).toBe(true);
    expect(decideCasePermission("case.update", facts).allowed).toBe(true);
  });
});

/**
 * MV-195 criterion 10 (Stage 5 slice 3) — decision C, and the comment it obliged.
 *
 * `case.list` stayed `deny` for a student. What did NOT survive is the reason the cell
 * carried: *"A student never lists cases: they have exactly one, reached directly."* The
 * founder decision of 2026-08-24 falsified the second half — a student may hold a personal
 * case AND a consultancy case — and a justification the product has outgrown is how the next
 * author reasons from a false premise.
 *
 * The cell is still right, for a reason the old comment did not give: `case.list` is
 * ORG-SCOPED (`ORG_SCOPED_PERMISSIONS`) and answered by `decideOrgPermission` from an
 * `organization_memberships` row. A student holds none, so there is no organization for them
 * to list cases WITHIN — flipping the cell would not be a one-line change, it would be a
 * second, roleless listing path. `listLinkedConsultancyCases` reaches both cases by
 * `student_user_id` instead, which is "reached directly" still holding with two.
 */
describe("MV-195 criterion 10 — the falsified justification is gone", () => {
  // CRLF working tree: `split("\n")` leaves a trailing "\r" on every line and an
  // anchored pattern stops matching, so the scan would pass VACUOUSLY (MISTAKES.md).
  const source = readFileSync(
    path.join(__dirname, "..", "..", "lib", "cases", "permissions.ts"),
    "utf8",
  );
  const lines = source.split(/\r?\n/);

  test("the scan reads a real file, so nothing below can pass by matching nothing", () => {
    expect(lines.length).toBeGreaterThan(100);
    expect(lines.some((line) => line.includes('"case.list": "deny"'))).toBe(true);
  });

  test("no comment still claims a student has exactly one case", () => {
    const claims = lines.filter((line) => /they have exactly one|exactly one case/i.test(line));
    expect(claims).toEqual([]);
  });

  test("the cell is still deny, and the module says why in terms that survive two cases", () => {
    expect(CASE_PERMISSION_MATRIX.student["case.list"]).toBe("deny");
    // The surviving reason has to be the org-scoping one, because that is the one the
    // founder decision cannot falsify.
    expect(source).toMatch(/org-scoped|organization-scoped/i);
  });
});

describe("inactive membership = nothing (the guard whose removal must fail a test)", () => {
  for (const role of MEMBERSHIP_ROLES) {
    test(`an inactive ${role} is denied all ${CARD_GRID.length} claims, even when assigned`, () => {
      const facts = staffFacts(role, { membershipStatus: "inactive", isAssignedToCase: true });
      for (const [permission] of CARD_GRID) {
        const decision = decideCasePermission(permission, facts);
        expect(decision.allowed).toBe(false);
        expect(decision.reason).toBe("membership-inactive");
      }
    });
  }

  test("a membership status the migration does not define denies everything", () => {
    const decision = decideCasePermission("case.read", {
      isOrgCase: true,
      membershipRole: "owner",
      membershipStatus: "suspended" as CaseAccessFacts["membershipStatus"],
      isAssignedToCase: true,
      isLinkedStudent: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("membership-inactive");
  });

  test("a staff role arriving with no membership row at all is denied", () => {
    const decision = decideCasePermission("case.read", staffFacts("owner", { membershipStatus: null }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("membership-inactive");
  });
});

// ---------------------------------------------------------------------------
// The dual-role rule, from docs/superpowers/specs/2026-08-02-stage1-canonical-
// access-matrix.md §"The dual-role rule":
//
//   "Membership (while status = 'active') grants org-scoped rights. The student
//    link grants student-scoped rights on that one case. The two are additive,
//    and an `inactive` membership contributes nothing — but revoking a
//    membership never removes a person's rights over their own student case."
//
// The defect this replaces: the membership role MASKED the student link, so a
// revoked counsellor who was also the linked student lost their own case.
// ---------------------------------------------------------------------------
describe("the dual-role rule — membership and the student link are additive", () => {
  function bothFacts(overrides: Partial<CaseAccessFacts> = {}): CaseAccessFacts {
    return {
      isOrgCase: true,
      membershipRole: "counsellor",
      membershipStatus: "active",
      isAssignedToCase: true,
      isLinkedStudent: true,
      ...overrides,
    };
  }

  test("an assigned counsellor who is also the linked student holds BOTH grants", () => {
    const facts = bothFacts();
    expect(deriveCaseGrants(facts).grants).toEqual([
      { role: "counsellor", scope: "assigned" },
      { role: "student", scope: "linked" },
    ]);
    // Staff-only claim: allowed through the counsellor grant.
    expect(decideCasePermission("case.notes.internal", facts).allowed).toBe(true);
    // Shared claim: allowed either way.
    expect(decideCasePermission("case.read", facts).allowed).toBe(true);
  });

  test("an INACTIVE membership contributes nothing, but never removes the student's own rights", () => {
    // The canonical case. A fired counsellor loses the org; they do not lose
    // their own case — they hold those rights as a data subject, not as staff.
    const revoked = bothFacts({ membershipStatus: "inactive" });
    expect(deriveCaseGrants(revoked).grants).toEqual([{ role: "student", scope: "linked" }]);
    expect(decideCasePermission("case.read", revoked).allowed).toBe(true);
    expect(decideCasePermission("case.update", revoked).allowed).toBe(true);
    // But nothing the membership used to carry survives.
    for (const permission of ["case.notes.internal", "case.export", "case.assign"] as const) {
      const decision = decideCasePermission(permission, revoked);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("role-not-permitted");
    }
  });

  test("a revoked member who is NOT the linked student still gets nothing at all", () => {
    const revoked = bothFacts({ membershipStatus: "inactive", isLinkedStudent: false });
    expect(deriveCaseGrants(revoked).grants).toEqual([]);
    for (const [permission] of CARD_GRID) {
      const decision = decideCasePermission(permission, revoked);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("membership-inactive");
    }
  });

  test("an unassigned counsellor who is the linked student is a student here, not staff", () => {
    const facts = bothFacts({ isAssignedToCase: false });
    expect(deriveCaseGrants(facts).grants).toEqual([{ role: "student", scope: "linked" }]);
    expect(decideCasePermission("case.read", facts).allowed).toBe(true);
    expect(decideCasePermission("case.notes.internal", facts).allowed).toBe(false);
  });

  test("an active owner who is also the linked student keeps every org right", () => {
    const facts = bothFacts({ membershipRole: "owner", isAssignedToCase: false });
    expect(deriveCaseGrants(facts).grants).toEqual([
      { role: "owner", scope: "all-org" },
      { role: "student", scope: "linked" },
    ]);
    expect(decideCasePermission("case.export", facts).allowed).toBe(true);
    expect(decideCasePermission("case.notes.internal", facts).allowed).toBe(true);
  });

  test("the student grant is the LINK, never the membership — staff get nothing student-shaped", () => {
    // An active counsellor assigned to a case they are not the student of gets
    // only the counsellor grant. The linked cell can never be reached by staff.
    const staff = bothFacts({ isLinkedStudent: false });
    expect(deriveCaseGrants(staff).grants).toEqual([{ role: "counsellor", scope: "assigned" }]);
  });

  test("a membership role the migration does not define cannot poison the student grant", () => {
    // A widened enum contributes no staff grant, but the student link is read
    // from cases.student_user_id independently — granting the actual student
    // their own case is not an escalation.
    const facts = bothFacts({ membershipRole: "auditor" as CaseRole });
    expect(deriveCaseGrants(facts).grants).toEqual([{ role: "student", scope: "linked" }]);
    expect(decideCasePermission("case.read", facts).allowed).toBe(true);
    expect(decideCasePermission("case.notes.internal", facts).allowed).toBe(false);
  });

  test("a 'student' membership row is schema drift and grants no org rights", () => {
    // organization_memberships.role excludes 'student' by check constraint
    // (migration line 60). A row claiming it must not become a staff grant.
    const facts = bothFacts({ membershipRole: "student", isLinkedStudent: false });
    expect(deriveCaseGrants(facts)).toEqual({ grants: [], reason: "unknown-role" });
  });

  test("accessScope reports the BROADEST grant, and hasAccess follows it", () => {
    expect(deriveAccessScope(bothFacts({ membershipRole: "owner" })).scope).toBe("all-org");
    expect(deriveAccessScope(bothFacts()).scope).toBe("assigned");
    expect(deriveAccessScope(bothFacts({ membershipStatus: "inactive" })).scope).toBe("linked");
    expect(deriveAccessScope(bothFacts({ membershipStatus: "inactive", isLinkedStudent: false })).scope).toBe(
      "deny",
    );
  });
});

/** The facts that make exactly one role's grant reachable — no dual-role mixing. */
function factsForRole(role: CaseRole): CaseAccessFacts {
  return role === "student"
    ? studentFacts()
    : staffFacts(role, { isAssignedToCase: true, isLinkedStudent: false });
}

describe("fail-closed by construction", () => {
  test("no relationship to the case at all → deny", () => {
    const decision = decideCasePermission("case.read", {
      isOrgCase: true,
      membershipRole: null,
      membershipStatus: null,
      isAssignedToCase: false,
      isLinkedStudent: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("no-relationship");
  });

  test("an unrecognised membership role denies every claim", () => {
    for (const [permission] of CARD_GRID) {
      const decision = decideCasePermission(permission, {
        isOrgCase: true,
        membershipRole: "superuser" as CaseRole,
        membershipStatus: "active",
        isAssignedToCase: true,
        isLinkedStudent: false,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("unknown-role");
    }
  });

  test("an unrecognised permission denies for every role", () => {
    for (const role of CASE_ROLES) {
      const decision = decideCasePermission("case.take_over" as CasePermission, factsForRole(role));
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("unknown-permission");
    }
  });

  test("every allow carries the grid cell that produced it, and every deny carries a reason", () => {
    for (const [permission] of CARD_GRID) {
      for (const role of CASE_ROLES) {
        const decision = decideCasePermission(permission, factsForRole(role));
        if (decision.allowed) {
          // A truthy allow is only ever returned with a matched, non-deny grid cell.
          expect(decision.requiredScope).toBe(scopeForRolePermission(role, permission));
          expect(decision.requiredScope).not.toBe("deny");
          expect(decision.reason).toBeNull();
        } else {
          expect(decision.reason).not.toBeNull();
        }
      }
    }
  });

  test("the matrix is exhaustive — no (role, permission) pair resolves to undefined", () => {
    for (const role of CASE_ROLES) {
      for (const permission of CASE_PERMISSIONS) {
        expect(scopeForRolePermission(role, permission)).toBeDefined();
      }
    }
  });

  test("the decision function performs no I/O — it is safe to call synchronously", () => {
    const decision = decideCasePermission("case.read", staffFacts("owner"));
    expect(decision).not.toBeInstanceOf(Promise);
  });
});
