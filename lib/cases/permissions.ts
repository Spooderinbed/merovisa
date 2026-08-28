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
 * (migration line 60) because a student attaches to a case through
 * `cases.student_user_id` rather than through a membership in its organization.
 *
 * MV-195: that link is PER CASE and a person may hold more than one — the founder
 * decision of 2026-08-24 has a student holding their own personal case
 * (`organization_id is null`) alongside a consultancy's. The role is still scoped to
 * one case at a time, which is what `linked` means below; what is no longer true is
 * that a student has only one case in total.
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
  /**
   * MV-182 — ask this case for a specific document, and resolve the ask. The verb
   * is the WRITE half only; reading the chase list rides `case.read`, so the
   * student's `deny` below withholds the ask and not the answer.
   */
  "case.documents.request",
  "org.audit.read",
  "org.manage",
  "org.settings",
] as const;
export type CasePermission = (typeof CASE_PERMISSIONS)[number];

/**
 * The 13 claims partition into two questions, and each is asked through its own
 * entry point.
 *
 * ORG-SCOPED claims are questions about an ORGANIZATION. "May this actor create
 * a case?" has no case id to hand — and `requireCasePermission` denies with
 * "unknown-case" when no row matches, so routing these through it would have
 * shipped five claims no caller could ever check. They go through
 * `requireOrgPermission(actorUserId, organizationId, permission)`.
 *
 * CASE-SCOPED claims are questions about one case and go through
 * `requireCasePermission(actorUserId, caseId, permission)`.
 *
 * The split is by TYPE at both entry points and re-checked at runtime in
 * `decideOrgPermission`, so a cast cannot borrow an org membership to answer a
 * question about a single case.
 */
export const ORG_SCOPED_PERMISSIONS = [
  "case.list",
  "case.create",
  "org.audit.read",
  "org.manage",
  "org.settings",
] as const satisfies readonly CasePermission[];
export type OrgScopedPermission = (typeof ORG_SCOPED_PERMISSIONS)[number];

export const CASE_SCOPED_PERMISSIONS = [
  "case.read",
  "case.update",
  "case.assign",
  "case.invite_student",
  "case.export",
  "case.archive",
  "case.delete",
  "case.notes.internal",
  "case.documents.request",
] as const satisfies readonly CasePermission[];
export type CaseScopedPermission = (typeof CASE_SCOPED_PERMISSIONS)[number];

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
 * The rows in `ORG_SCOPED_PERMISSIONS` are read by `decideOrgPermission` against
 * an organization; the rest by `decideCasePermission` against one case. Same
 * grid, two questions — which is why the table stays whole rather than being
 * split in half and drifting.
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
    "case.documents.request": "all-org",
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
    "case.documents.request": "all-org",
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
    // A counsellor chases documents on the cases they hold — the same reach as
    // `case.invite_student`, and the same predicate at the database
    // (`private.can_staff_case`, whose counsellor arm requires BOTH an active
    // membership and a `case_assignments` row).
    "case.documents.request": "assigned",
    "org.audit.read": "deny",
    "org.manage": "deny",
    "org.settings": "deny",
  },
  student: {
    /**
     * Still `deny`, but NOT for the reason this cell used to give. It was defended on
     * the ground that a student holds a single case and reaches it directly, and the
     * founder decision of 2026-08-24 falsified the first half — a student may hold a
     * personal case AND a consultancy case (MV-195, decision C).
     *
     * The surviving reason is the one the founder decision cannot touch: `case.list` is
     * ORG-SCOPED (`ORG_SCOPED_PERMISSIONS`) and `decideOrgPermission` answers it from an
     * `organization_memberships` row. A student holds none, so there is no organization
     * for them to list cases WITHIN — an allow here would have no question to answer.
     * Flipping the cell would therefore not be a one-line change; it would be a second,
     * roleless listing path, and that asymmetry is itself the argument for leaving it.
     *
     * "Reached directly" still holds with two cases, and is how the student surface
     * works: `lib/cases/linked-consultancy-cases.ts` resolves them by
     * `cases.student_user_id`, the same axis `resolvePersonalCaseId` uses for the other
     * half — neither of them a `case.list`.
     */
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
    // The WRITE half only. Asking a case for a document is something the
    // consultancy does TO a case, and a student asking their own case for a
    // passport is not a state the product has. Reading what has been asked of
    // them is `case.read`, which this role holds at `linked` — so this `deny`
    // withholds the ask, never the answer. The student-facing surface that shows
    // it is Stage 5 and is not built by MV-182.
    "case.documents.request": "deny",
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
  | "scope-mismatch"
  | "lookup-failed";

/**
 * Everything the decision needs, and nothing it could be lied to about. Each
 * field is resolved from a database row by `getCaseContext`; none of it may
 * originate in a JWT claim, `app_metadata`, `user_metadata`, a header, or a
 * caller argument (plan line 101).
 *
 * `membershipRole` and `isLinkedStudent` are SEPARATE facts on purpose. A single
 * `role` field forced a choice between them, and the choice it made — membership
 * first, student only as a fallback — is precisely the masking defect the
 * canonical matrix names (spec §"The dual-role rule"). Student-ness is not a
 * membership role; it is a link on one case, and the two are additive.
 */
export interface CaseAccessFacts {
  /** False for a personal case — `cases.organization_id is null`. */
  isOrgCase: boolean;
  /**
   * `organization_memberships.role` VERBATIM, or null when the actor has no
   * membership row in this case's organization. Never `student`: the
   * check constraint excludes it (migration line 60), and a row carrying it
   * anyway is schema drift that grants nothing.
   */
  membershipRole: CaseRole | null;
  /** From `organization_memberships.status`; null when the actor has no membership row. */
  membershipStatus: MembershipStatus | null;
  /** A `case_assignments` row exists for (this case, this actor). */
  isAssignedToCase: boolean;
  /** `cases.student_user_id` equals the actor. */
  isLinkedStudent: boolean;
}

/**
 * What the actor is to an ORGANIZATION, independent of any case. Resolved by
 * `getOrgContext` from a single `organization_memberships` row.
 */
export interface OrgAccessFacts {
  membershipRole: CaseRole | null;
  membershipStatus: MembershipStatus | null;
}

/**
 * One relationship the actor genuinely holds on one case, and how far it reaches.
 * An actor may hold two at once — staff of the organization AND the case's linked
 * student — which is the whole point of modelling grants as a list.
 */
export interface CaseGrant {
  role: CaseRole;
  scope: Exclude<PermissionScope, "deny">;
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
 * Does this membership row still confer ORG standing? The one place the org gate
 * conditions live, so `decideOrgPermission`, `deriveCaseGrants` and
 * `getOrgContext` cannot drift apart on what "inactive membership", "unknown
 * role", or "not a member" mean.
 *
 * Inactive membership = nothing (plan lines 352, 355), and that is total for
 * ORGANIZATION rights: any status that is not the active spelling denies, which
 * also covers a value a later migration adds.
 */
export function deriveOrgStanding(facts: OrgAccessFacts): {
  isActiveMember: boolean;
  reason: CaseDenyReason | null;
} {
  const { membershipRole, membershipStatus } = facts;
  if (membershipRole === null) return { isActiveMember: false, reason: "no-relationship" };
  // A role string the migration does not define grants nothing, however it got
  // here — this is what stops a widened DB enum from quietly inheriting access.
  // `student` lands here too: it is not a membership role (migration line 60).
  if (!isCaseRole(membershipRole) || !isMembershipRole(membershipRole)) {
    return { isActiveMember: false, reason: "unknown-role" };
  }
  if (membershipStatus !== ACTIVE_MEMBERSHIP_STATUS) {
    return { isActiveMember: false, reason: "membership-inactive" };
  }
  return { isActiveMember: true, reason: null };
}

/**
 * Every relationship the actor genuinely holds on one case. Pure.
 *
 * THE DUAL-ROLE RULE (canonical access matrix, §"The dual-role rule"):
 *
 * > Membership (while `status = 'active'`) grants org-scoped rights. The student
 * > link grants student-scoped rights on that one case. The two are additive, and
 * > an `inactive` membership contributes nothing — but revoking a membership
 * > never removes a person's rights over their own student case.
 *
 * So the two halves are computed independently and neither can veto the other. A
 * fired counsellor loses the organization; they do not lose the case they are the
 * student of, because they hold those rights as a data subject, not as staff.
 * Equally, an unrecognised membership role costs the actor their staff grant and
 * nothing else — the student link is read from `cases.student_user_id`, and
 * handing the actual linked student their own case is not an escalation.
 *
 * `reason` is populated only when the result is EMPTY, and explains the most
 * specific thing that went wrong; a non-empty grant list carries no reason.
 */
export function deriveCaseGrants(facts: CaseAccessFacts): {
  grants: readonly CaseGrant[];
  reason: CaseDenyReason | null;
} {
  const grants: CaseGrant[] = [];
  let reason: CaseDenyReason | null = null;

  // --- The staff half: what the organization membership confers. ---
  if (facts.membershipRole !== null) {
    const standing = deriveOrgStanding(facts);
    if (!standing.isActiveMember) {
      reason = standing.reason;
    } else if (facts.membershipRole === "counsellor") {
      // A counsellor reaches only the cases assigned to them.
      if (facts.isAssignedToCase) grants.push({ role: "counsellor", scope: "assigned" });
      else reason = "not-assigned";
    } else if (facts.membershipRole === "owner" || facts.membershipRole === "admin") {
      // A personal case belongs to no organization, so nothing is org-wide on it.
      if (facts.isOrgCase) grants.push({ role: facts.membershipRole, scope: "all-org" });
      else reason = "scope-mismatch";
    }
  }

  // --- The student half: what the case linkage confers, on this case alone. ---
  // Deliberately not an `else`. This is the additive rule; making it conditional
  // on the staff half is the masking defect.
  if (facts.isLinkedStudent) grants.push({ role: "student", scope: "linked" });

  if (grants.length > 0) return { grants, reason: null };
  return { grants, reason: reason ?? "no-relationship" };
}

/** All-org reaches furthest, then assigned, then the actor's own single case. */
const SCOPE_BREADTH: Record<Exclude<PermissionScope, "deny">, number> = {
  "all-org": 3,
  assigned: 2,
  linked: 1,
};

/**
 * The single broadest scope an actor holds on one case, independent of any claim.
 * A summary of `deriveCaseGrants` for callers that need one value — chiefly
 * `CaseContext.accessScope` / `hasAccess`. Authorization decisions use the grants
 * themselves; a dual-role actor's broadest scope does not imply every claim that
 * scope could satisfy.
 */
export function deriveAccessScope(facts: CaseAccessFacts): {
  scope: PermissionScope;
  reason: CaseDenyReason | null;
  grants: readonly CaseGrant[];
} {
  const { grants, reason } = deriveCaseGrants(facts);
  if (grants.length === 0) return { scope: "deny", reason: reason ?? "no-relationship", grants };
  const broadest = grants.reduce((widest, grant) =>
    SCOPE_BREADTH[grant.scope] > SCOPE_BREADTH[widest.scope] ? grant : widest,
  );
  return { scope: broadest.scope, reason: null, grants };
}

/**
 * Decide one case-level claim against one set of DB-sourced facts. Pure and
 * synchronous.
 *
 * An allow requires a grant the actor genuinely holds whose scope is EXACTLY what
 * the grid cell for (that grant's role, this claim) requires. Each grant is tried
 * on its own — a dual-role actor is allowed if either half suffices, and neither
 * half lends the other its scope. Anything else — no grants at all, an absent
 * grid cell, a `deny` cell, or a required/granted mismatch — returns a deny with
 * a reason. There is no `default: allow` and no truthy fall-through.
 */
export function decideCasePermission(
  permission: CasePermission,
  facts: CaseAccessFacts,
): CasePermissionDecision {
  const { grants, reason } = deriveCaseGrants(facts);
  if (grants.length === 0) return deny(reason ?? "no-relationship");

  let sawUnknownPermission = false;
  let mismatchedScope: PermissionScope | null = null;

  for (const grant of grants) {
    const requiredScope = scopeForRolePermission(grant.role, permission);
    // A claim this module does not know is never allowed for anyone.
    if (requiredScope === undefined) {
      sawUnknownPermission = true;
      continue;
    }
    // The grid's "—": this role never holds this claim.
    if (requiredScope === "deny") continue;
    if (requiredScope === grant.scope) return { allowed: true, requiredScope, reason: null };
    // A required scope this grant does not carry (e.g. a future edit handing a
    // counsellor an `all-org` claim) denies rather than widening.
    mismatchedScope = requiredScope;
  }

  if (sawUnknownPermission) return deny("unknown-permission");
  if (mismatchedScope !== null) return deny("scope-mismatch", mismatchedScope);
  return deny("role-not-permitted", "deny");
}

/**
 * Decide one ORGANIZATION-level claim. Pure and synchronous.
 *
 * The scope on an allow is load-bearing and is NOT a formality: `case.list` for a
 * counsellor allows with scope `assigned`, which means "may list, filtered to
 * their own `case_assignments`" — never "may see every case in the organization".
 * A caller that ignores the returned scope has not finished authorizing.
 *
 * The student role is absent by construction: a student holds no membership row,
 * so they reach no org-scoped claim at all.
 */
export function decideOrgPermission(
  permission: OrgScopedPermission,
  facts: OrgAccessFacts,
): CasePermissionDecision {
  // Runtime half of the entry-point split: a case-scoped claim cast into this
  // function is refused rather than answered from an org membership.
  if (!(ORG_SCOPED_PERMISSIONS as readonly string[]).includes(permission)) {
    return deny("unknown-permission");
  }

  const standing = deriveOrgStanding(facts);
  if (!standing.isActiveMember) return deny(standing.reason ?? "no-relationship");

  const requiredScope = scopeForRolePermission(facts.membershipRole as CaseRole, permission);
  if (requiredScope === undefined) return deny("unknown-permission");
  if (requiredScope === "deny") return deny("role-not-permitted", "deny");
  return { allowed: true, requiredScope, reason: null };
}
