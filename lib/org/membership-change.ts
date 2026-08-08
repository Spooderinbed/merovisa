import "server-only";
import {
  ACTIVE_MEMBERSHIP_STATUS,
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUSES,
  type MembershipRole,
  type MembershipStatus,
} from "@/lib/cases/permissions";

/**
 * What an actor who ALREADY holds `org.manage` may do to one membership row —
 * access-matrix cell 5 (spec §4), decided as a pure function of database-sourced
 * facts. No I/O: `lib/org/repo.ts` does the reading, the route joins them.
 *
 * This mirrors `organization_memberships_update_admin`
 * (20260730180000_case_aware_rls_policies.sql:373), which carries the same
 * conjunct TWICE:
 *
 *   organization_id = any (actor_admin_org_ids())
 *   and (role <> 'owner' or organization_id = any (actor_owner_org_ids()))
 *
 * USING gates the row as it stands; WITH CHECK the row as it would become. Both
 * horns are mirrored here, because mirroring only WITH CHECK leaves "an admin
 * demotes the owner" allowed in TypeScript — the request's role is not 'owner',
 * but the row's current role is. The database refuses that; this layer must agree
 * or it is not defense in depth, it is a second opinion that disagrees.
 *
 * The first conjunct — is the actor an admin of THIS organization — is not decided
 * here. `requireOrgPermission(actor, org, "org.manage")` answers it from the
 * database, and `actorIsOwner` below comes from the same place (`org.settings` is
 * the matrix's owner-only claim: "renaming the organization and transferring
 * ownership stay with the owner"). Neither may originate in a caller argument or
 * a JWT claim (plan line 101).
 */

export type MembershipChangeDenyReason =
  | "empty-change"
  | "self-mutation"
  | "owner-role-reserved"
  | "owner-row-reserved"
  | "unknown-role"
  | "unknown-status";

/** The two columns `grant update (role, status)` covers (…:696), and nothing else. */
export interface MembershipChange {
  role?: MembershipRole;
  status?: MembershipStatus;
}

export interface MembershipChangeFacts {
  actorUserId: string;
  /**
   * The actor holds `org.settings` on this organization — i.e. Postgres would find
   * this org in `actor_owner_org_ids()`. Resolved from `organization_memberships`,
   * never asserted by the caller.
   */
  actorIsOwner: boolean;
  targetUserId: string;
  /** `organization_memberships.role` VERBATIM, so drift denies instead of passing. */
  targetCurrentRole: string;
}

export type MembershipChangeDecision =
  | { allowed: true; change: MembershipChange }
  | { allowed: false; reason: MembershipChangeDenyReason };

function isMembershipRole(value: unknown): value is MembershipRole {
  return typeof value === "string" && (MEMBERSHIP_ROLES as readonly string[]).includes(value);
}

function isMembershipStatus(value: unknown): value is MembershipStatus {
  return typeof value === "string" && (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

export function decideMembershipChange(
  request: { role?: unknown; status?: unknown },
  facts: MembershipChangeFacts,
): MembershipChangeDecision {
  // Build the change from the two granted columns only. A caller that supplied
  // `organization_id` or `user_id` gets them dropped here rather than at the
  // database — those columns are not in the grant, so a SET list containing one
  // is 42501 at plan time for the whole statement.
  const change: MembershipChange = {};
  if (request.role !== undefined) {
    if (!isMembershipRole(request.role)) return { allowed: false, reason: "unknown-role" };
    change.role = request.role;
  }
  if (request.status !== undefined) {
    if (!isMembershipStatus(request.status)) return { allowed: false, reason: "unknown-status" };
    change.status = request.status;
  }
  if (change.role === undefined && change.status === undefined) {
    return { allowed: false, reason: "empty-change" };
  }

  // The lockout guard. The database permits an owner to deactivate themselves;
  // with F-2 (nobody can create an organization) and F-5 (nobody can invite), that
  // is a permanent, in-product-unrepairable lockout. Strictly narrower than the
  // canonical cell, so it moves nothing — see the card's decision log.
  if (facts.actorUserId === facts.targetUserId) {
    return { allowed: false, reason: "self-mutation" };
  }

  // A role string the check constraint does not define is drift, and drift must
  // not read as "not an owner, therefore an admin may edit it".
  if (!isMembershipRole(facts.targetCurrentRole)) {
    return { allowed: false, reason: "unknown-role" };
  }

  if (!facts.actorIsOwner) {
    // USING: the row as it stands.
    if (facts.targetCurrentRole === "owner") {
      return { allowed: false, reason: "owner-row-reserved" };
    }
    // WITH CHECK: the row as it would become.
    if (change.role === "owner") {
      return { allowed: false, reason: "owner-role-reserved" };
    }
  }

  return { allowed: true, change };
}

/** Re-exported so a caller never hard-codes the active spelling. */
export { ACTIVE_MEMBERSHIP_STATUS };
