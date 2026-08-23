import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { createStudentInvitation } from "@/lib/cases/invitations-repo";
import { caseDenialResponse } from "@/lib/cases/route-denial";
import { malformedPathId } from "@/lib/cases/path-ids";
import { invitationLink } from "@/lib/invitations/token";
import { resolveSiteOrigin } from "@/lib/auth/site-origin";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";

/**
 * MV-193 — mint one student invitation for a case (Stage 5 slice 1).
 *
 * ## The gate is `case.invite_student`, and not `case.read`
 *
 * They answer differently for the same person, and the difference is the whole point of
 * the claim: a counsellor holds it at `assigned`, an owner/admin at `all-org`, and the
 * student at `deny`. A route that gated this on the read claim would let a linked
 * student mint invitations to their own case. The database refuses independently
 * (`invitations_insert_staff` → `private.can_staff_case`), but a route relying on that
 * has stopped authorizing and would ship the wrong status to every caller.
 *
 * ## Authorize, then write
 *
 * Nothing here touches the repository before the decision.
 *
 * ## The case comes from the PATH
 *
 * Spec F-8: a case-scoped write route that resolves the ACTOR's own case writes to the
 * counsellor's file instead of the student's, and RLS cannot catch it because the
 * counsellor may legitimately reach both.
 *
 * ## THE TOKEN LEAVES HERE ONCE, IN A RESPONSE BODY
 *
 * `token` is in the 201 payload and in nothing else — no redirect, no `Location`, no
 * query string, no log line. CLAUDE.md: "No sensitive data in URLs, query params, or
 * client-side logs." The token appears in a URL only when the STUDENT clicks the link,
 * which is slice 2's surface to scope; it must never appear in a counsellor-side one,
 * and a POST body is what keeps it out of access logs, `Referer` headers and browser
 * history.
 *
 * ## Why the response carries a fully-formed `link` rather than just the token
 *
 * `/invite/<token>` is slice 2's route and the origin resolution behind it is subtle
 * enough to have its own module (`lib/auth/site-origin.ts`: behind Vercel's load
 * balancer `new URL(request.url).origin` is the FUNCTION's internal host). Assembling
 * the link in the browser would put that logic in client JS and get it wrong in exactly
 * one environment — production.
 *
 * ## The audit event is written AFTER the row commits, and a failed audit is a 500
 *
 * MV-189's D12 invariant: **no route returns a 2xx without its audit row committed.**
 * The ordering follows the three MV-189 mutation paths rather than the two mint paths —
 * recording `invitation.minted` for a mint that then failed would be a lie in an
 * evidence log, so the effect commits first.
 *
 * That leaves one honest, visible failure state: the row exists, the audit did not, and
 * the counsellor gets a 500 without ever seeing the token. The invitation then shows in
 * the case's list as outstanding with no link behind it, and the counsellor revokes it
 * and mints again — two audited acts. It is recoverable and it is on screen, which is
 * more than can be said for the alternative of returning a token nothing recorded.
 */

const BodySchema = z
  .object({
    // The DB column is `text not null`. Zod's email check is the guard between a typo
    // and a credential mailed nowhere — the counsellor sends this link themselves, so
    // a malformed address is not caught later by a bounce.
    email: z.email().trim().min(3).max(254),
  })
  // `.strict()`, so `role`, `caseId`, `expiresAt` or `token` in the body is a 422 rather
  // than a silently ignored key. Every one of those is decided by the server: the role
  // is always `student`, the case is the path, the expiry is a constant, and the token
  // is generated. A caller who sends one has misunderstood something worth telling them.
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await params;

  // FIRST, before a client exists and before any query — see `lib/cases/path-ids.ts`.
  const malformed = malformedPathId(caseId);
  if (malformed) return malformed;

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

  const result = await createStudentInvitation(data.user.id, caseId, parsed.data.email, supabase);

  if (!result.ok) {
    // Each reason tells the person something different about what to do next, so each
    // gets its own status. `denied` and `write-failed` must never collapse: one means
    // "ask someone", the other "try again".
    switch (result.reason) {
      case "unknown-case":
        return NextResponse.json({ error: "No such case", reason: result.reason }, { status: 404 });
      case "already-outstanding":
        // 409, not 422: the request was well-formed and the state is what refused it.
        // The counsellor's next move is to revoke the one that is already out, which
        // the case surface offers beside this control.
        return NextResponse.json(
          { error: "An invitation is already outstanding for this case", reason: result.reason },
          { status: 409 },
        );
      case "not-an-org-case":
      case "invalid-input":
        return NextResponse.json(
          { error: "Validation failed", reason: result.reason },
          { status: 422 },
        );
      case "denied":
        return NextResponse.json({ error: "Forbidden", reason: result.reason }, { status: 403 });
      default:
        return NextResponse.json(
          { error: "Could not create the invitation", reason: result.reason },
          { status: 500 },
        );
    }
  }

  // Service-role touches `audit_events` and NOTHING else. `authenticated` holds SELECT
  // on that table and no INSERT — MV-152 wrote the mechanism down itself: "Audit rows
  // are written by server paths running as service_role." The invitation row above was
  // written on the AUTHENTICATED client, through the policy.
  const admin = createSupabaseAdminClient();
  try {
    await writeAuditEvent(admin, {
      actorUserId: data.user.id,
      // D15 — the case's own organization, from the permission check rather than
      // re-queried. `createStudentInvitation` has already refused a personal case, so
      // this is never null in practice; it is written as whatever the case says.
      organizationId: context.organizationId ?? null,
      caseId,
      action: "invitation.minted",
      entityType: "invitation",
      entityId: result.id,
      // D13 — NO metadata at all, and specifically not the invited address. An email is
      // raw student detail, `entity_id` already identifies the row, and the row itself
      // carries the address for anyone authorized to read it.
    });
  } catch {
    return NextResponse.json({ error: "Could not record the invitation" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      id: result.id,
      expiresAt: result.expiresAt,
      // Returned ONCE. Nothing in the product can produce these two values again.
      token: result.token,
      link: invitationLink(resolveSiteOrigin(request), result.token),
    },
    { status: 201 },
  );
}
