import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseAuthorizationClient } from "@/lib/cases/context";
import { ACTIVE_MEMBERSHIP_STATUS, type MembershipRole } from "@/lib/cases/permissions";
import type { MembershipChange } from "./membership-change";

/**
 * Reads and writes for the consultancy workspace's organization surfaces —
 * access-matrix cells 1, 2, 4 and 5 (spec §4).
 *
 * THE AUTHENTICATED CLIENT, ALWAYS. Row Level Security evaluated as the signed-in
 * user is the tenant boundary; `lib/cases/` is defense in depth on top of it
 * (`lib/cases/README.md`). This module never imports `createSupabaseAdminClient`
 * and never names the service-role key. Every function takes an optional client so
 * tests can inject a fake — never so a caller can substitute a wider one.
 *
 * NO SQL SHIPS WITH THIS MODULE. Every grant and policy it depends on landed with
 * MV-152 and is live: `select` on both tables, `update (name, slug)` on
 * `organizations` behind `organizations_update_owner`, and `update (role, status)`
 * on `organization_memberships` behind `organization_memberships_update_admin`
 * (20260730180000_case_aware_rls_policies.sql:325-390, :682-696).
 *
 * TWO REFUSAL SHAPES, AND ONLY ONE OF THEM IS AN ERROR:
 *
 * 1. A **column-grant** violation raises `42501`. supabase-js RESOLVES that rather
 *    than rejecting, so a call site that does not destructure `error` drops the
 *    write in silence. `throwOnError` is used nowhere in this repo.
 * 2. A **policy** refusal is not an error at all. Postgres reports it as zero rows
 *    affected, so even a call site that checks `error` reads it as a success.
 *
 * Every write below therefore `.select()`s the row back and treats an empty result
 * as a denial. That read-back is load-bearing, not defensive noise.
 */

export interface ActorOrganization {
  id: string;
  name: string;
  slug: string;
  /** The actor's own role in this organization. Always an active membership. */
  role: MembershipRole;
}

/**
 * One membership row, carried VERBATIM. `role` and `status` stay `string` rather
 * than the narrowed unions on purpose: a value a later migration adds must reach
 * the decision layer as itself so it can deny, not be coerced into a known one.
 */
export interface OrgMember {
  id: string;
  userId: string;
  role: string;
  status: string;
}

export type OrgReadResult<T> = { ok: true; data: T } | { ok: false; reason: "lookup-failed" };

export type OrgWriteResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "slug-taken" | "write-failed" };

function isPresent(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

const LOOKUP_FAILED = { ok: false, reason: "lookup-failed" } as const;

async function client(db?: CaseAuthorizationClient): Promise<CaseAuthorizationClient> {
  return db ?? (await createSupabaseServerClient());
}

/**
 * Cell 1 — the organizations the actor may work in.
 *
 * Two queries, both RLS-scoped, intersected here. The membership query is filtered
 * on the ACTIVE status explicitly: `organization_memberships_select_member` shows
 * an inactive member their own row by design (it must survive for the audit
 * trail), so relying on RLS alone would list the organization they were revoked
 * from. The `organizations` read is the second lock — a membership row whose
 * organization did not come back is dropped rather than rendered from the id.
 */
export async function listActorOrganizations(
  actorUserId: string,
  db?: CaseAuthorizationClient,
): Promise<OrgReadResult<ActorOrganization[]>> {
  if (!isPresent(actorUserId)) return LOOKUP_FAILED;

  try {
    const supabase = await client(db);

    const memberships = await supabase
      .from("organization_memberships")
      .select("organization_id, role")
      .eq("user_id", actorUserId)
      .eq("status", ACTIVE_MEMBERSHIP_STATUS);
    if (memberships.error) return LOOKUP_FAILED;

    const roleByOrg = new Map<string, MembershipRole>();
    for (const row of memberships.data ?? []) {
      roleByOrg.set(row.organization_id, row.role as MembershipRole);
    }
    if (roleByOrg.size === 0) return { ok: true, data: [] };

    const organizations = await supabase.from("organizations").select("id, name, slug");
    if (organizations.error) return LOOKUP_FAILED;

    const data = (organizations.data ?? [])
      .filter((org) => roleByOrg.has(org.id))
      .map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: roleByOrg.get(org.id) as MembershipRole,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { ok: true, data };
  } catch {
    return LOOKUP_FAILED;
  }
}

/**
 * Cell 4 — the team. Inactive members are INCLUDED: `status` is the revocation
 * switch and the row deliberately survives, so hiding them would make a
 * deactivation look like a deletion to the admin who just performed one.
 *
 * The list carries no names or email addresses, and cannot: `organization_memberships`
 * holds only `user_id`, and `auth.users` is not readable by `authenticated`.
 * Recorded as F-9 in the Stage 3 spec — fixing it needs a readable staff-identity
 * source, which is a schema change Stage 3 forbids (spec §5).
 */
export async function listOrgMembers(
  organizationId: string,
  db?: CaseAuthorizationClient,
): Promise<OrgReadResult<OrgMember[]>> {
  if (!isPresent(organizationId)) return LOOKUP_FAILED;

  try {
    const supabase = await client(db);
    const result = await supabase
      .from("organization_memberships")
      .select("id, user_id, role, status")
      .eq("organization_id", organizationId);
    if (result.error) return LOOKUP_FAILED;

    return {
      ok: true,
      data: (result.data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        role: row.role,
        status: row.status,
      })),
    };
  } catch {
    return LOOKUP_FAILED;
  }
}

/**
 * The row a change is decided against. Scoped to the organization from the URL as
 * well as the membership id: RLS would refuse a cross-tenant UPDATE anyway, but
 * resolving the row without the org filter would let the decision layer read a
 * role from the wrong organization before the database ever saw the write.
 */
export async function getOrgMembership(
  organizationId: string,
  membershipId: string,
  db?: CaseAuthorizationClient,
): Promise<OrgReadResult<OrgMember | null>> {
  if (!isPresent(organizationId) || !isPresent(membershipId)) return LOOKUP_FAILED;

  try {
    const supabase = await client(db);
    const result = await supabase
      .from("organization_memberships")
      .select("id, user_id, role, status")
      .eq("organization_id", organizationId)
      .eq("id", membershipId)
      .maybeSingle();
    if (result.error) return LOOKUP_FAILED;
    if (!result.data) return { ok: true, data: null };

    return {
      ok: true,
      data: {
        id: result.data.id,
        userId: result.data.user_id,
        role: result.data.role,
        status: result.data.status,
      },
    };
  } catch {
    return LOOKUP_FAILED;
  }
}

/** `42501` is a grant violation; anything else is an infrastructure failure. */
function writeFailure(code: string | undefined, duplicateReason: "slug-taken" | null): OrgWriteResult {
  if (code === "42501") return { ok: false, reason: "denied" };
  if (code === "23505" && duplicateReason) return { ok: false, reason: duplicateReason };
  return { ok: false, reason: "write-failed" };
}

/** Cell 5's write. The change must already have been authorized by `decideMembershipChange`. */
export async function applyMembershipChange(
  organizationId: string,
  membershipId: string,
  change: MembershipChange,
  db?: CaseAuthorizationClient,
): Promise<OrgWriteResult> {
  if (!isPresent(organizationId) || !isPresent(membershipId)) {
    return { ok: false, reason: "write-failed" };
  }
  if (change.role === undefined && change.status === undefined) {
    return { ok: false, reason: "write-failed" };
  }

  try {
    const supabase = await client(db);
    const result = await supabase
      .from("organization_memberships")
      .update(change as never)
      .eq("organization_id", organizationId)
      .eq("id", membershipId)
      .select("id")
      .maybeSingle();
    if (result.error) return writeFailure(result.error.code, null);
    // Zero rows back = the policy excluded the row. Not an error, and not a save.
    if (!result.data) return { ok: false, reason: "denied" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}

/**
 * Cell 2's write — owner-only at the database
 * (`organizations_update_owner`, canonical divergence #1). The grant is
 * `update (name, slug)`; nothing else may enter the SET list.
 */
export async function renameOrganization(
  organizationId: string,
  patch: { name?: string; slug?: string },
  db?: CaseAuthorizationClient,
): Promise<OrgWriteResult> {
  if (!isPresent(organizationId)) return { ok: false, reason: "write-failed" };

  const update: { name?: string; slug?: string } = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.slug !== undefined) update.slug = patch.slug;
  if (update.name === undefined && update.slug === undefined) {
    return { ok: false, reason: "write-failed" };
  }

  try {
    const supabase = await client(db);
    const result = await supabase
      .from("organizations")
      .update(update as never)
      .eq("id", organizationId)
      .select("id")
      .maybeSingle();
    if (result.error) return writeFailure(result.error.code, "slug-taken");
    if (!result.data) return { ok: false, reason: "denied" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}
