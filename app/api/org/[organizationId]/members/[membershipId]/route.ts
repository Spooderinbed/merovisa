import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOrgPermission } from "@/lib/cases/require-org-permission";
import { MEMBERSHIP_ROLES, MEMBERSHIP_STATUSES } from "@/lib/cases/permissions";
import { decideMembershipChange } from "@/lib/org/membership-change";
import { applyMembershipChange, getOrgMembership } from "@/lib/org/repo";

/**
 * Access-matrix cell 5 — change a member's role, or deactivate them.
 *
 * Three gates in this order, and the order is the point:
 *
 * 1. `org.manage` — is the actor an admin or owner HERE? Answered from the
 *    database by `checkOrgPermission`, never from a caller argument or a JWT
 *    claim. A counsellor stops here and the membership row is never read.
 * 2. `org.settings` — is the actor the OWNER? The matrix reserves that claim to
 *    `owner` alone, which is the TypeScript spelling of `actor_owner_org_ids()`.
 * 3. `decideMembershipChange` — the owner carve-out on the row itself, mirroring
 *    both horns of `organization_memberships_update_admin`, plus the self-lockout
 *    guard.
 *
 * Then the write, whose result is read back: a policy refusal is zero rows
 * affected, not an error, so `{ ok: true }` here means a row genuinely changed.
 *
 * ADDING a member is deliberately absent. Spec F-5: staff invitations are Stage 5,
 * so Stage 3 team management manages memberships that already exist. The plan's
 * bullet 1 reads as a fuller surface than the model supports.
 */

// Exactly `grant update (role, status) on public.organization_memberships`.
// `.strict()` refuses `organization_id`/`user_id` outright — they are not in the
// grant, so a SET list containing one is 42501 for the entire statement.
const BodySchema = z
  .object({
    role: z.enum(MEMBERSHIP_ROLES).optional(),
    status: z.enum(MEMBERSHIP_STATUSES).optional(),
  })
  .strict()
  .refine((body) => body.role !== undefined || body.status !== undefined, {
    message: "Provide a role or a status",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; membershipId: string }> },
): Promise<Response> {
  const { organizationId, membershipId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actorUserId = data.user.id;

  const manage = await checkOrgPermission(actorUserId, organizationId, "org.manage", supabase);
  if (!manage.decision.allowed) {
    return NextResponse.json({ error: "Forbidden", reason: manage.decision.reason }, { status: 403 });
  }
  const settings = await checkOrgPermission(actorUserId, organizationId, "org.settings", supabase);

  const membership = await getOrgMembership(organizationId, membershipId, supabase);
  if (!membership.ok) {
    return NextResponse.json({ error: "Could not read the membership" }, { status: 500 });
  }
  if (membership.data === null) {
    return NextResponse.json({ error: "No such member in this organization" }, { status: 404 });
  }

  const decision = decideMembershipChange(parsed.data, {
    actorUserId,
    actorIsOwner: settings.decision.allowed,
    targetUserId: membership.data.userId,
    targetCurrentRole: membership.data.role,
  });
  if (!decision.allowed) {
    return NextResponse.json({ error: "Forbidden", reason: decision.reason }, { status: 403 });
  }

  const result = await applyMembershipChange(organizationId, membershipId, decision.change, supabase);
  if (!result.ok) {
    if (result.reason === "denied") {
      return NextResponse.json({ error: "Forbidden", reason: "denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Could not save the change" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
