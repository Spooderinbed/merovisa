import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deriveAccessScope,
  type CaseAccessFacts,
  type CaseDenyReason,
  type CaseGrant,
  type CaseRole,
  type MembershipStatus,
  type PermissionScope,
} from "./permissions";

/**
 * `getCaseContext` — resolve, from the database and nothing else, what one actor
 * is to one case.
 *
 * Read `./README.md` first. Two properties of this module are load-bearing:
 *
 * 1. **It uses the AUTHENTICATED client.** Row Level Security evaluated as the
 *    signed-in user is the tenant boundary (plan §"Enforcement boundary"); this
 *    function is defense in depth on top of it. Handing it the service-role
 *    client would silently convert it from a second lock into a bypass, so it
 *    never imports `createSupabaseAdminClient` and defaults to
 *    `createSupabaseServerClient()`.
 * 2. **Every failure resolves to deny.** A missing case, an absent membership, an
 *    unrecognised enum value, a PostgREST error, or a thrown client all produce a
 *    no-access context. Nothing here throws through to the caller and nothing
 *    falls through to allow — the classic authorization defect is a caught error
 *    treated as "no restriction found".
 *
 * Role is read only from `organization_memberships` / `case_assignments` /
 * `cases.student_user_id` rows. It is never taken from a JWT claim,
 * `app_metadata`, `user_metadata`, a header, or a caller argument (plan line 101:
 * "Roles must never be trusted from browser state or authentication metadata
 * alone"). This module touches no session object at all.
 */

/**
 * The narrow slice of the Supabase client this layer needs. Structural, so tests
 * inject an in-memory fake without a cast at the call site — and so nothing here
 * can reach `.auth` to learn a role.
 */
export type CaseAuthorizationClient = Pick<SupabaseClient<Database>, "from">;

export interface CaseContext extends CaseAccessFacts {
  actorUserId: string;
  caseId: string;
  /** False when the case id matched no row, or the lookup could not be completed. */
  caseExists: boolean;
  /** The case's organization, or null for a personal case / an unresolved case. */
  organizationId: string | null;
  /**
   * Every relationship the actor genuinely holds on this case — staff, student,
   * or both. THIS is the authorization fact; `membershipRole` is only what the
   * membership row said, carried verbatim so `denyReason` can tell a widened enum
   * ("unknown-role") apart from an absent relationship ("no-relationship").
   * Gate on `hasAccess` or on a decision, never on `membershipRole`.
   */
  grantedRoles: readonly CaseRole[];
  /**
   * The BROADEST scope among `grantedRoles`; "deny" means no access. A summary
   * for rendering and logging — it is not itself an authorization: a dual-role
   * actor's broadest scope does not imply every claim that scope could satisfy.
   */
  accessScope: PermissionScope;
  denyReason: CaseDenyReason | null;
  /** Convenience gate, exactly equivalent to `accessScope !== "deny"`. */
  hasAccess: boolean;
}

/**
 * A context that grants nothing and asserts nothing. Used for every outcome where
 * the actor's relationship to the case was not established — so a caller can
 * never read a half-populated fact as evidence of access.
 */
function noAccess(actorUserId: string, caseId: string, reason: CaseDenyReason): CaseContext {
  return {
    actorUserId,
    caseId,
    caseExists: false,
    isOrgCase: false,
    organizationId: null,
    membershipRole: null,
    membershipStatus: null,
    isAssignedToCase: false,
    isLinkedStudent: false,
    grantedRoles: [],
    accessScope: "deny",
    denyReason: reason,
    hasAccess: false,
  };
}

function isPresent(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function getCaseContext(
  actorUserId: string,
  caseId: string,
  db?: CaseAuthorizationClient,
): Promise<CaseContext> {
  // A blank identifier can only come from a bug or a probe; neither earns a query.
  if (!isPresent(actorUserId) || !isPresent(caseId)) {
    return noAccess(actorUserId, caseId, "invalid-input");
  }

  try {
    const client = db ?? (await createSupabaseServerClient());

    const caseResult = await client
      .from("cases")
      .select("id, organization_id, student_user_id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseResult.error) return noAccess(actorUserId, caseId, "lookup-failed");
    if (!caseResult.data) return noAccess(actorUserId, caseId, "unknown-case");

    const organizationId = caseResult.data.organization_id ?? null;
    const isOrgCase = organizationId !== null;
    const isLinkedStudent = caseResult.data.student_user_id === actorUserId;

    // Membership is scoped to THIS case's organization, which is what makes a
    // found row proof of same-tenant standing: an owner of another organization
    // matches no row here, so cross-tenant reach never resolves a role.
    let membershipRole: CaseRole | null = null;
    let membershipStatus: MembershipStatus | null = null;
    if (isOrgCase) {
      const membershipResult = await client
        .from("organization_memberships")
        .select("role, status")
        .eq("organization_id", organizationId)
        .eq("user_id", actorUserId)
        .maybeSingle();
      if (membershipResult.error) return noAccess(actorUserId, caseId, "lookup-failed");
      if (membershipResult.data) {
        membershipRole = membershipResult.data.role as CaseRole;
        membershipStatus = membershipResult.data.status as MembershipStatus;
      }
    }

    // Only staff can hold an assignment that means anything: `assigned` scope is
    // reachable only through the counsellor role, which requires a membership row.
    // Without one we skip the lookup — an orphan assignment grants nothing.
    let isAssignedToCase = false;
    if (membershipRole !== null) {
      const assignmentResult = await client
        .from("case_assignments")
        .select("user_id")
        .eq("case_id", caseId)
        .eq("user_id", actorUserId)
        .maybeSingle();
      if (assignmentResult.error) return noAccess(actorUserId, caseId, "lookup-failed");
      isAssignedToCase = assignmentResult.data !== null;
    }

    // NOTE: the student link is NOT folded into `membershipRole` here. It used to
    // be — as a fallback taken only when the membership lookup found nothing —
    // and that is exactly how a membership came to mask a person's rights over
    // their own case. The two facts stay separate and `deriveCaseGrants` adds
    // them (spec §"The dual-role rule").
    const facts: CaseAccessFacts = {
      isOrgCase,
      membershipRole,
      membershipStatus,
      isAssignedToCase,
      isLinkedStudent,
    };
    const { scope, reason, grants } = deriveAccessScope(facts);

    return {
      ...facts,
      actorUserId,
      caseId,
      caseExists: true,
      organizationId,
      grantedRoles: grants.map((grant: CaseGrant) => grant.role),
      accessScope: scope,
      denyReason: reason,
      hasAccess: scope !== "deny",
    };
  } catch {
    // Includes a thrown client, an aborted request, and a client that does not
    // expose `from`. An authorization lookup that could not complete is a deny.
    return noAccess(actorUserId, caseId, "lookup-failed");
  }
}
