import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CASE_PERMISSIONS,
  CASE_PERMISSION_MATRIX,
  CASE_ROLES,
  MEMBERSHIP_ROLES,
  decideCasePermission,
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
  ["org.audit.read", "all-org", "all-org", "deny", "deny"],
  ["org.manage", "all-org", "all-org", "deny", "deny"],
  ["org.settings", "all-org", "deny", "deny", "deny"],
];

const COLUMN_ROLES: CaseRole[] = ["owner", "admin", "counsellor", "student"];

/** Facts for an active staff member of the case's organization. */
function staffFacts(role: "owner" | "admin" | "counsellor", overrides: Partial<CaseAccessFacts> = {}): CaseAccessFacts {
  return {
    isOrgCase: true,
    role,
    membershipStatus: "active",
    isAssignedToCase: false,
    isLinkedStudent: false,
    ...overrides,
  };
}

/** Facts for the student whose Auth user is linked to the case. */
function studentFacts(overrides: Partial<CaseAccessFacts> = {}): CaseAccessFacts {
  return {
    isOrgCase: true,
    role: "student",
    membershipStatus: null,
    isAssignedToCase: false,
    isLinkedStudent: true,
    ...overrides,
  };
}

describe("case permission matrix — the card grid, cell for cell", () => {
  test("the matrix covers exactly the 13 claims and 4 roles the card names", () => {
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
  test("assigned counsellor may read, update, invite the student, and use internal notes", () => {
    const facts = staffFacts("counsellor", { isAssignedToCase: true });
    for (const permission of ["case.read", "case.update", "case.invite_student", "case.notes.internal"] as const) {
      expect(decideCasePermission(permission, facts).allowed).toBe(true);
    }
  });

  test("unassigned counsellor is denied every assigned-scope claim", () => {
    const facts = staffFacts("counsellor", { isAssignedToCase: false });
    for (const permission of ["case.read", "case.update", "case.invite_student", "case.notes.internal"] as const) {
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

  test("a student who is not the linked student is denied their own claims", () => {
    const facts = studentFacts({ isLinkedStudent: false });
    for (const permission of ["case.read", "case.update"] as const) {
      const decision = decideCasePermission(permission, facts);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("not-linked-student");
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

  test("a linked student on a personal case keeps their linked-scope claims", () => {
    const facts = studentFacts({ isOrgCase: false });
    expect(decideCasePermission("case.read", facts).allowed).toBe(true);
    expect(decideCasePermission("case.update", facts).allowed).toBe(true);
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

  test("a revoked staff member who is also the linked student still gets nothing", () => {
    // Deliberately fail-closed: 'inactive membership = nothing' outranks student
    // linkage, so revocation is total and needs no per-claim reasoning.
    const decision = decideCasePermission("case.read", {
      isOrgCase: true,
      role: "counsellor",
      membershipStatus: "inactive",
      isAssignedToCase: true,
      isLinkedStudent: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("membership-inactive");
  });

  test("a membership status the migration does not define denies everything", () => {
    const decision = decideCasePermission("case.read", {
      isOrgCase: true,
      role: "owner",
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

  test("a student arriving with an inactive membership is denied", () => {
    const decision = decideCasePermission("case.read", studentFacts({ membershipStatus: "inactive" }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("membership-inactive");
  });
});

describe("fail-closed by construction", () => {
  test("no relationship to the case at all → deny", () => {
    const decision = decideCasePermission("case.read", {
      isOrgCase: true,
      role: null,
      membershipStatus: null,
      isAssignedToCase: false,
      isLinkedStudent: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("no-relationship");
  });

  test("an unrecognised role denies every claim", () => {
    for (const [permission] of CARD_GRID) {
      const decision = decideCasePermission(permission, {
        isOrgCase: true,
        role: "superuser" as CaseRole,
        membershipStatus: "active",
        isAssignedToCase: true,
        isLinkedStudent: true,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("unknown-role");
    }
  });

  test("an unrecognised permission denies for every role", () => {
    for (const role of CASE_ROLES) {
      const facts: CaseAccessFacts = {
        isOrgCase: true,
        role,
        membershipStatus: role === "student" ? null : "active",
        isAssignedToCase: true,
        isLinkedStudent: true,
      };
      const decision = decideCasePermission("case.take_over" as CasePermission, facts);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("unknown-permission");
    }
  });

  test("every allow carries the grid cell that produced it, and every deny carries a reason", () => {
    for (const [permission] of CARD_GRID) {
      for (const role of CASE_ROLES) {
        const facts: CaseAccessFacts = {
          isOrgCase: true,
          role,
          membershipStatus: role === "student" ? null : "active",
          isAssignedToCase: true,
          isLinkedStudent: true,
        };
        const decision = decideCasePermission(permission, facts);
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
