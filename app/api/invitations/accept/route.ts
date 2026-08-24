import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit/upstash";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import {
  INVITATION_ACCEPT_ENTITY_TYPE,
  linkCaseToStudent,
  redeemInvitationToken,
} from "@/lib/invitations/accept";
import { ACCEPT_FAILURE_MESSAGES, type AcceptRouteFailure } from "@/lib/invitations/accept-messages";

/**
 * MV-194 — accepting a student invitation (Stage 5 slice 2).
 *
 * ## The token is in a POST BODY, and that is the whole point of this route existing
 *
 * The student's inbound link — `/invite/<token>` — is the ONE place the plaintext is
 * allowed to be a URL, because it is the credential the counsellor pasted into a chat
 * message. Everything after that is this route, and a POST body is what keeps the token out
 * of a second URL, out of a redirect, out of `Referer`, out of browser history and out of
 * every access log between here and Postgres (CLAUDE.md: no sensitive data in URLs, query
 * params, or client-side logs).
 *
 * So this route issues no redirect and sets no `Location`. It answers with the case id and
 * the page navigates, if it navigates at all.
 *
 * ## There is no `checkCasePermission` here, and that is the design
 *
 * Every other case-scoped route in this codebase authorizes a caller against a case they
 * name. This one cannot: the invitee is not a member, not an assigned counsellor and not
 * yet the linked student, so under RLS they can see neither the invitation nor the case
 * they are accepting into — which is exactly why Stage 1's
 * `SANCTIONED_SERVICE_ROLE_CATEGORIES` listed "invitation acceptance" before any of it
 * existed, with its required check spelled out: *"Atomic compare-and-swap on
 * invitations.token_hash … the affected row count is the authorization."*
 *
 * **The case id is never supplied by the caller.** It comes out of the row the swap won.
 * A route that accepted one would let any token holder point a token at any case, which is
 * the same defect spec F-8 names one layer up.
 *
 * ## THE ORDER: swap, audit, link — and both halves of it are load-bearing
 *
 * *Swap before link* is the card's position, and the two orderings fail differently. If the
 * link fails after the swap, the token is burned and the student is unlinked: recoverable by
 * a counsellor re-minting, and the failure is support load. If the swap failed after the
 * link, a consultancy's case would have been pointed at a person on the strength of a token
 * that turned out to be expired, revoked or already spent — a security regression no
 * support round trip recovers.
 *
 * *Audit between them* is this route's own decision, and it is what pays the card's "make
 * the link's failure loud … and an audit row". `invitation.accepted` records that the
 * CREDENTIAL WAS CONSUMED, which is true the instant the swap commits and stays true
 * whatever the link then does. Auditing after the link instead would leave the one state
 * the card worries about — a spent token with nobody linked — recorded nowhere.
 *
 * It follows MV-189's D12 in both directions: a failed audit is a 500 with the link never
 * attempted, and no 2xx is returned without the audit row committed.
 *
 * ## What a failed link costs, and why it is not a 200
 *
 * A half-done acceptance answers 409 or 500 with a message that says plainly that the link
 * has been spent — see `ACCEPT_FAILURE_MESSAGES`. The counsellor sees the same state from
 * their side without being told: the case surface already renders the invitation as
 * `accepted` while the case shows no linked student.
 *
 * The residual gap is real and is recorded as a finding on the dossier: PostgREST gives one
 * statement per request, so the two writes cannot share a transaction without a database
 * function, and this slice takes no migration.
 */

const BodySchema = z
  .object({
    // The shape `mintInvitationToken` produces: 32 bytes of randomBytes, base64url. The
    // bounds are deliberately loose around 43 characters so a future token size is not a
    // silent 422, and the character class is the load-bearing half — it is what refuses a
    // value carrying `/`, `?`, `#` or whitespace, any of which would mean the caller is
    // sending something other than a token and would be worth telling them about.
    token: z
      .string()
      .trim()
      .min(32)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  // `.strict()`, so `caseId` in the body is a 422 rather than a silently ignored key. The
  // case is decided by the token and by nothing else; a caller who sends one has
  // misunderstood something worth telling them.
  .strict();

/** One place the wire shape is built, so a refusal cannot drift from its message. */
function refusal(reason: AcceptRouteFailure, status: number): Response {
  return NextResponse.json({ error: ACCEPT_FAILURE_MESSAGES[reason], reason }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    // The issues are NOT echoed. Zod's flattened output quotes the offending value, which
    // here is the credential itself — the one thing criterion 7 keeps out of a response.
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Per ACCOUNT rather than per IP, and after the 401: the token is 256 bits of
  // `randomBytes`, so guessing is arithmetically closed and this is not what defends it.
  // What it bounds is an authenticated caller hammering the endpoint — which costs two
  // service-role statements per attempt and would otherwise be free.
  if (!(await checkRateLimit("invitation-accept", data.user.id, 10, "1 m"))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  // Decision A needs an address to compare. An Auth account without one cannot be checked,
  // and guessing — treating "no address" as "any address" — would defeat the check for
  // exactly the accounts least able to prove who they are.
  const actorEmail = data.user.email;
  if (!actorEmail) return refusal("no-account-email", 403);

  // Service-role, because BOTH writes are outside every `authenticated` grant:
  // `invitations.accepted_at` is in none, and `cases.student_user_id` is excluded from the
  // column grant by name. See `lib/invitations/accept.ts` and the registry entry.
  const admin = createSupabaseAdminClient();

  const redeemed = await redeemInvitationToken(admin, {
    token: parsed.data.token,
    // From the VERIFIED session, never from the body. The token proves which invitation;
    // the session proves who is holding it.
    actorUserId: data.user.id,
    actorEmail,
  });

  if (!redeemed.ok) {
    switch (redeemed.reason) {
      case "invalid-token":
        return refusal(redeemed.reason, 404);
      case "email-mismatch":
        return refusal(redeemed.reason, 403);
      case "already-accepted":
      case "revoked":
        // 409 for both: the request was well-formed and the invitation's STATE refused it.
        // They share a status and not a message — "already used" and "withdrawn" send the
        // student to different next actions.
        return refusal(redeemed.reason, 409);
      case "expired":
        // 410 Gone, and precisely. The credential existed and no longer does; a 404 would
        // tell the student to check their link, which is not the thing that is wrong.
        return refusal(redeemed.reason, 410);
      case "invalid-input":
        return refusal(redeemed.reason, 400);
      default:
        return refusal("redeem-failed", 500);
    }
  }

  // DECISION C — this student already spent this token and the case is already theirs.
  // Nothing was written, so nothing is audited: an audit row here would record a second
  // acceptance that did not happen. They are landed in the case rather than shown an error
  // for succeeding twice.
  if (redeemed.outcome === "already-yours") {
    return NextResponse.json({ ok: true, caseId: redeemed.caseId, alreadyLinked: true });
  }

  try {
    await writeAuditEvent(admin, {
      actorUserId: data.user.id,
      // D15 — the case's own organization, straight off the row the swap won rather than
      // re-queried, so the evidence names the tenant the invitation actually belonged to.
      organizationId: redeemed.organizationId,
      caseId: redeemed.caseId,
      action: "invitation.accepted",
      entityType: INVITATION_ACCEPT_ENTITY_TYPE,
      entityId: redeemed.invitationId,
      // D13 — NO metadata, and specifically not the invited address. An email is raw
      // student detail, and `entity_id` already identifies the row. MV-193 carried none on
      // either of its two events for the same reason.
    });
  } catch {
    return NextResponse.json({ error: "Could not record the acceptance" }, { status: 500 });
  }

  const linked = await linkCaseToStudent(admin, redeemed.caseId, data.user.id);
  if (!linked.ok) {
    // LOUD, never a silent 200. The token is spent and the student is not linked, and the
    // message says so — see `ACCEPT_FAILURE_MESSAGES` for why it does not say "try again".
    return refusal(linked.reason, linked.reason === "case-already-linked" ? 409 : 500);
  }

  return NextResponse.json({ ok: true, caseId: redeemed.caseId });
}
