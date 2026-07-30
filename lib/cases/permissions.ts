import "server-only";

/**
 * The role → permission matrix for the consultancy case workspace, as a PURE
 * function of database-sourced facts. No I/O lives here: `getCaseContext`
 * (./context.ts) does the reading, this module does the deciding, and
 * `requireCasePermission` (./require-permission.ts) joins them.
 *
 * Read `./README.md` before changing anything here. The short version: this
 * layer is defense in depth, NOT the tenant boundary — Row Level Security
 * evaluated as the authenticated user is load-bearing (plan §"Enforcement
 * boundary"). MV-152 encodes the same access model in SQL; this table and those
 * policies must agree cell for cell, and the enum values below come from the
 * merged migration (20260730120000_stage1_tenancy_core.sql), never from a guess.
 *
 * `server-only` is deliberate even though the module is pure: permission rules
 * are server business logic and must never be readable in client JS (CLAUDE.md
 * §Architecture Rules, the same reasoning that keeps the scoring engine
 * server-side). Tests neutralise it with `vi.mock("server-only", () => ({}))`,
 * the established repo idiom.
 *
 * Source of the grid: docs/kanban/cards/MV-151-case-permission-boundary.md and
 * docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md
 * §"Users and responsibilities" + §"Authorization rules".
 */

/**
 * Roles the matrix reasons about. `student` is a *case-linkage* role, not a
 * membership role: `organization_memberships.role` deliberately excludes it
 * (migration line 60) because students attach to exactly one case through
 * `cases.student_user_id`.
 *
 * CAUTION: `invitations.role` is a different, wider set that DOES include
 * 'student' (migration line 147). Do not conflate the two.
 */
export const CASE_ROLES = ["owner", "admin", "counsellor", "student"] as const;
export type CaseRole = (typeof CASE_ROLES)[number];

/** Exactly the `organization_memberships.role` check constraint (migration line 60). */
export const MEMBERSHIP_ROLES = ["owner", "admin", "counsellor"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Exactly the `organization_memberships.status` check constraint (migration line 61). */
export const MEMBERSHIP_STATUSES = ["active", "inactive"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * The one spelling of "this membership still grants access". Hard-coding a
 * guessed value elsewhere is the schema-drift defect the card warns about, so
 * every status comparison in `lib/cases/` goes through this constant.
 */
export const ACTIVE_MEMBERSHIP_STATUS = "active" satisfies MembershipStatus;

/** Claims a caller can ask for. Ordered as the card's grid rows. */
export const CASE_PERMISSIONS = [
  "case.list",
  "case.read",
  "case.update",
  "case.create",
  "case.assign",
  "case.invite_student",
  "case.export",
  "case.archive",
  "case.delete",
  "case.notes.internal",
  "org.audit.read",
  "org.manage",
  "org.settings",
] as const;
export type CasePermission = (typeof CASE_PERMISSIONS)[number];

/**
 * What relationship a role needs to *this* case for a claim to hold.
 *
 * - `all-org`  every case in the actor's organization (and, for the `org.*`
 *              claims, the organization the case belongs to)
 * - `assigned` only cases with a `case_assignments` row for the actor
 * - `linked`   only the case whose `student_user_id` is the actor
 * - `deny`     the card grid's "—": this role never holds this claim
 */
export const PERMISSION_SCOPES = ["all-org", "assigned", "linked", "deny"] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

/**
 * The grid. Every cell is stated explicitly — there is no default, no fallback,
 * and no wildcard, so a claim added to `CASE_PERMISSIONS` without a decision for
 * each role fails to compile rather than silently inheriting an allow.
 *
 * The `org.*` claims are organization-level rather than case-level; they are
 * resolved through the same entry point because the case names the organization
 * whose settings/team/audit trail is in question. A personal case (no
 * `organization_id`) therefore satisfies no `all-org` claim at all.
 */
export const CASE_PERMISSION_MATRIX: Record<CaseRole, Record<CasePermission, PermissionScope>> = {
  owner: {
    "case.list": "all-org",
    "case.read": "all-org",
    "case.update": "all-org",
    "case.create": "all-org",
    "case.assign": "all-org",
    "case.invite_student": "all-org",
    "case.export": "all-org",
    "case.archive": "all-org",
    "case.delete": "all-org",
    "case.notes.internal": "all-org",
    "org.audit.read": "all-org",
    "org.manage": "all-org",
    "org.settings": "all-org",
  },
  admin: {
    "case.list": "all-org",
    "case.read": "all-org",
    "case.update": "all-org",
    "case.create": "all-org",
    "case.assign": "all-org",
    "case.invite_student": "all-org",
    "case.export": "all-org",
    "case.archive": "all-org",
    "case.delete": "all-org",
    "case.notes.internal": "all-org",
    "org.audit.read": "all-org",
    "org.manage": "all-org",
    // Renaming the organization and transferring ownership stay with the owner.
    "org.settings": "deny",
  },
  counsellor: {
    "case.list": "assigned",
    "case.read": "assigned",
    "case.update": "assigned",
    // Stage 1 default: case creation is an owner/admin action. Widening this is a
    // deliberate later decision, not a convenience.
    "case.create": "deny",
    "case.assign": "deny",
    "case.invite_student": "assigned",
    "case.export": "deny",
    "case.archive": "deny",
    "case.delete": "deny",
    "case.notes.internal": "assigned",
    "org.audit.read": "deny",
    "org.manage": "deny",
    "org.settings": "deny",
  },
  student: {
    // A student never lists cases: they have exactly one, reached directly.
    "case.list": "deny",
    "case.read": "linked",
    // Field-level restriction ("permitted fields only") is NOT enforced here —
    // see ./README.md §"Known gap: student permitted fields". A Stage 3 mutation
    // that accepts an arbitrary case patch from a student is a defect even though
    // this cell allows the claim.
    "case.update": "linked",
    "case.create": "deny",
    "case.assign": "deny",
    "case.invite_student": "deny",
    "case.export": "deny",
    "case.archive": "deny",
    "case.delete": "deny",
    // Never. Consultancy-internal notes are invisible to the student whose case
    // they describe (plan §"Student", line 99).
    "case.notes.internal": "deny",
    "org.audit.read": "deny",
    "org.manage": "deny",
    "org.settings": "deny",
  },
};

/** Why a decision denied. Every deny carries one; MV-153 asserts against them. */
export type CaseDenyReason =
  | "invalid-input"
  | "unknown-case"
  | "unknown-role"
  | "unknown-permission"
  | "no-relationship"
  | "membership-inactive"
  | "role-not-permitted"
  | "not-assigned"
  | "not-linked-student"
  | "scope-mismatch"
  | "lookup-failed";

/**
 * Everything the decision needs, and nothing it could be lied to about. Each
 * field is resolved from a database row by `getCaseContext`; none of it may
 * originate in a JWT claim, `app_metadata`, `user_metadata`, a header, or a
 * caller argument (plan line 101).
 */
export interface CaseAccessFacts {
  /** False for a personal case — `cases.organization_id is null`. */
  isOrgCase: boolean;
  /** From `organization_memberships.role`, or `student` via `cases.student_user_id`. */
  role: CaseRole | null;
  /** From `organization_memberships.status`; null when the actor has no membership row. */
  membershipStatus: MembershipStatus | null;
  /** A `case_assignments` row exists for (this case, this actor). */
  isAssignedToCase: boolean;
  /** `cases.student_user_id` equals the actor. */
  isLinkedStudent: boolean;
}

export type CasePermissionDecision =
  | { allowed: true; requiredScope: Exclude<PermissionScope, "deny">; reason: null }
  | { allowed: false; requiredScope: PermissionScope | null; reason: CaseDenyReason };

function isCaseRole(value: unknown): value is CaseRole {
  return typeof value === "string" && (CASE_ROLES as readonly string[]).includes(value);
}

function isMembershipRole(role: CaseRole): role is MembershipRole {
  return (MEMBERSHIP_ROLES as readonly string[]).includes(role);
}

/**
 * The grid cell for a pair, or `undefined` when either side is not a value this
 * module knows. Callers must treat `undefined` as deny, never as "unrestricted".
 */
export function scopeForRolePermission(
  role: CaseRole,
  permission: CasePermission,
): PermissionScope | undefined {
  if (!isCaseRole(role)) return undefined;
  return CASE_PERMISSION_MATRIX[role][permission];
}

function deny(reason: CaseDenyReason, requiredScope: PermissionScope | null = null): CasePermissionDecision {
  return { allowed: false, requiredScope, reason };
}

/**
 * The single scope an actor is GRANTED on one case, independent of any claim —
 * the broadest relationship the database supports for them here. Pure.
 *
 * This is the one place the gate conditions live, so `decideCasePermission` and
 * `getCaseContext` cannot drift apart on what "inactive membership" or "unknown
 * role" mean.
 */
export function deriveAccessScope(facts: CaseAccessFacts): {
  scope: PermissionScope;
  reason: CaseDenyReason | null;
} {
  const { role, membershipStatus, isOrgCase, isAssignedToCase, isLinkedStudent } = facts;

  // No relationship to the case at all.
  if (role === null) return { scope: "deny", reason: "no-relationship" };

  // A role string the migration does not define grants nothing, however it got
  // here — this is what stops a widened DB enum from quietly inheriting access.
  if (!isCaseRole(role)) return { scope: "deny", reason: "unknown-role" };

  // Inactive membership = nothing (plan lines 352, 355). Total, and checked
  // before any scope is granted so no role/claim combination can route around it:
  //   * any non-null status that is not the active spelling denies, which also
  //     covers a status value a later migration adds;
  //   * staff must hold exactly the active status — a missing membership row
  //     means the actor is not staff of this case's organization.
  if (membershipStatus !== null && membershipStatus !== ACTIVE_MEMBERSHIP_STATUS) {
    return { scope: "deny", reason: "membership-inactive" };
  }
  if (isMembershipRole(role) && membershipStatus !== ACTIVE_MEMBERSHIP_STATUS) {
    return { scope: "deny", reason: "membership-inactive" };
  }

  switch (role) {
    case "owner":
    case "admin":
      // A personal case belongs to no organization, so nothing is org-wide on it.
      if (!isOrgCase) return { scope: "deny", reason: "scope-mismatch" };
      return { scope: "all-org", reason: null };
    case "counsellor":
      if (!isAssignedToCase) return { scope: "deny", reason: "not-assigned" };
      return { scope: "assigned", reason: null };
    case "student":
      if (!isLinkedStudent) return { scope: "deny", reason: "not-linked-student" };
      return { scope: "linked", reason: null };
    default: {
      // Exhaustiveness: a role added to CASE_ROLES without a branch here fails to
      // compile, and fails closed at runtime if it ever ships.
      const unreachable: never = role;
      void unreachable;
      return { scope: "deny", reason: "unknown-role" };
    }
  }
}

/**
 * Decide one claim against one set of DB-sourced facts. Pure and synchronous.
 *
 * Two independent conditions must both hold for an allow: the actor must be
 * GRANTED a scope on this case (`deriveAccessScope`), and the grid cell for
 * (role, claim) must REQUIRE exactly that scope. Anything else — an absent grid
 * cell, a `deny` cell, a granted deny, or a required/granted mismatch — returns a
 * deny with a reason. There is no `default: allow` and no truthy fall-through.
 */
export function decideCasePermission(
  permission: CasePermission,
  facts: CaseAccessFacts,
): CasePermissionDecision {
  const granted = deriveAccessScope(facts);
  if (granted.scope === "deny") {
    return deny(granted.reason ?? "scope-mismatch");
  }

  // `role` is non-null and recognised here, or deriveAccessScope would have denied.
  const requiredScope = scopeForRolePermission(facts.role as CaseRole, permission);
  if (requiredScope === undefined) return deny("unknown-permission");
  if (requiredScope === "deny") return deny("role-not-permitted", "deny");

  // A required scope the actor was not granted (e.g. a future edit handing a
  // counsellor an `all-org` claim) denies rather than widening.
  if (requiredScope !== granted.scope) return deny("scope-mismatch", requiredScope);

  return { allowed: true, requiredScope, reason: null };
}
