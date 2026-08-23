import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { revokeCaseInvitation } from "@/lib/cases/invitations-repo";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import { malformedPathId } from "@/lib/cases/path-ids";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";

/**
 * MV-193 — revoke one student invitation (Stage 5 slice 1).
 *
 * ## The same claim as the mint, deliberately
 *
 * `case.invite_student` gates both, so the two verbs appear and disappear together —
 * criterion 6: revocation "is permitted for a counsellor who could have minted it, and
 * is refused for everyone else". A surface offering "invite" without "revoke" would be
 * offering half a workflow, and at the database the two are already the same answer:
 * `invitations_insert_staff` and `invitations_update_staff` both end in
 * `private.can_staff_case(case_id)` for the student branch.
 *
 * ## PATCH, not DELETE, and the difference is the record
 *
 * A revoked invitation **still exists**. MV-152 shipped no DELETE policy on
 * `invitations` at all and said why: "revocation is the audited path, and a deleted
 * invitation is a deleted record of who was invited." So this route stamps `revoked_at`
 * — the one column in the client's UPDATE grant — and never removes a row.
 *
 * ## Why the body is `{ revoked: true }` and `.strict()`
 *
 * `accepted_at` is outside the grant entirely, which is what keeps acceptance a
 * server-side compare-and-swap for slice 2. A permissive body would let a caller ASK for
 * acceptance and get a confusing `42501` from the database instead of a clear 422 from
 * the route. `.strict()` makes `{ accepted: true }` a validation failure at the door,
 * which is the honest answer: this endpoint does one thing.
 *
 * ## Both ids are filters, and that is not belt-and-braces
 *
 * The caller authorized ONE case. Without the `case_id` predicate the invitation id
 * alone decides which row moves, so an id from another case the actor happens to staff
 * would be revoked under this case's authorization (spec F-8). RLS still holds the
 * tenant boundary — but "the tenant boundary held" is not "the row the user was looking
 * at is the row that changed".
 */

const BodySchema = z.object({ revoked: z.literal(true) }).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ caseId: string; invitationId: string }> },
): Promise<Response> {
  const { caseId, invitationId } = await params;

  // FIRST, before a client exists and before any query — see `lib/cases/path-ids.ts`.
  // BOTH segments: a malformed invitation id would otherwise reach Postgres as a `22P02`
  // inside the update and surface as a 500 the caller reads as an outage.
  const malformedCase = malformedPathId(caseId);
  if (malformedCase) return malformedCase;
  const malformedInvitation = malformedPathId(invitationId);
  if (malformedInvitation) return malformedInvitation;

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

  const { decision, context } = await checkCasePermission(
    data.user.id,
    caseId,
    "case.invite_student",
    supabase,
  );
  if (!decision.allowed) return caseDenialResponse(decision.reason);

  const result = await revokeCaseInvitation(invitationId, caseId, supabase);

  if (!result.ok) {
    switch (result.reason) {
      case "invalid-input":
        return NextResponse.json(
          { error: "Validation failed", reason: result.reason },
          { status: 422 },
        );
      case "denied":
        // Zero rows, which is both "the policy refused" and "no such invitation on this
        // case". They are not distinguished on purpose: telling the two apart would make
        // this route an existence oracle for invitation ids in other tenants.
        return NextResponse.json({ error: "Forbidden", reason: result.reason }, { status: 403 });
      default:
        return NextResponse.json(
          { error: "Could not revoke the invitation", reason: result.reason },
          { status: 500 },
        );
    }
  }

  // Service-role touches `audit_events` and nothing else — see the mint route.
  const admin = createSupabaseAdminClient();
  try {
    await writeAuditEvent(admin, {
      actorUserId: data.user.id,
      organizationId: context.organizationId ?? null,
      caseId,
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: invitationId,
      // D13 — no metadata. The invited address is raw student detail and `entity_id`
      // already names the row. `reason` is on the allow-list and is deliberately not
      // used: this route has one reason, and a constant is not evidence.
    });
  } catch {
    return NextResponse.json({ error: "Could not record the revocation" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
