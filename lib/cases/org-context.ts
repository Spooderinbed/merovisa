import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseAuthorizationClient } from "./context";
import {
  deriveOrgStanding,
  type CaseDenyReason,
  type CaseRole,
  type MembershipStatus,
  type OrgAccessFacts,
} from "./permissions";

/**
 * `getOrgContext` — resolve, from the database and nothing else, what one actor
 * is to one ORGANIZATION.
 *
 * The sibling of `getCaseContext` (./context.ts) for the questions that have no
 * case to name: "may this actor create a case?", "may they read the audit
 * trail?", "may they rename the organization?". Read `./README.md` first; the
 * same two properties are load-bearing here — it uses the AUTHENTICATED client,
 * and every failure resolves to deny.
 *
 * ONE QUERY, DELIBERATELY. There is no `organizations` existence probe, so an
 * unknown organization and "you are not a member" are indistinguishable
 * ("no-relationship"). That is the honest answer as well as the safe one: under
 * RLS a non-member cannot read the `organizations` row either, so a probe would
 * report "unknown" in both cases — while handing an outsider an
 * organization-enumeration oracle for the ids that do exist.
 */

export interface OrgContext extends OrgAccessFacts {
  actorUserId: string;
  organizationId: string;
  /** True only for a recognised membership role carrying the active status. */
  isActiveMember: boolean;
  denyReason: CaseDenyReason | null;
  /** Convenience gate, exactly equivalent to `isActiveMember`. */
  hasAccess: boolean;
}

/** A context that grants nothing and asserts nothing. */
function noStanding(actorUserId: string, organizationId: string, reason: CaseDenyReason): OrgContext {
  return {
    actorUserId,
    organizationId,
    membershipRole: null,
    membershipStatus: null,
    isActiveMember: false,
    denyReason: reason,
    hasAccess: false,
  };
}

function isPresent(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function getOrgContext(
  actorUserId: string,
  organizationId: string,
  db?: CaseAuthorizationClient,
): Promise<OrgContext> {
  // A blank identifier can only come from a bug or a probe; neither earns a query.
  if (!isPresent(actorUserId) || !isPresent(organizationId)) {
    return noStanding(actorUserId, organizationId, "invalid-input");
  }

  try {
    const client = db ?? (await createSupabaseServerClient());

    const membershipResult = await client
      .from("organization_memberships")
      .select("role, status")
      .eq("organization_id", organizationId)
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (membershipResult.error) return noStanding(actorUserId, organizationId, "lookup-failed");
    if (!membershipResult.data) return noStanding(actorUserId, organizationId, "no-relationship");

    const facts: OrgAccessFacts = {
      membershipRole: membershipResult.data.role as CaseRole,
      membershipStatus: membershipResult.data.status as MembershipStatus,
    };
    const { isActiveMember, reason } = deriveOrgStanding(facts);

    return {
      ...facts,
      actorUserId,
      organizationId,
      isActiveMember,
      denyReason: reason,
      hasAccess: isActiveMember,
    };
  } catch {
    // Includes a thrown client, an aborted request, and a client that does not
    // expose `from`. An authorization lookup that could not complete is a deny.
    return noStanding(actorUserId, organizationId, "lookup-failed");
  }
}
