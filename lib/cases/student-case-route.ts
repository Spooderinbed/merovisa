import "server-only";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkCasePermission } from "./require-permission";
import { isWellFormedId } from "./path-ids";

/**
 * MV-195 — `openStudentCaseRoute`, the gate on the STUDENT's door to a consultancy
 * case (Stage 5 slice 3).
 *
 * ## Why this exists rather than reusing `openCaseRoute`
 *
 * MV-194 shipped the link; nothing shipped the door. Every route that can render a
 * consultancy case lives under `/workspace/[organizationId]/students/[caseId]`, and
 * that org layout gates on ACTIVE `organization_memberships` — a set from which
 * `student` is deliberately excluded (`./permissions.ts`, migration line 60) — so a
 * linked student hits `notFound()` at the LAYOUT, before any page authorizes
 * anything. There was no student-reachable URL for a consultancy case anywhere.
 *
 * Admitting students to `/workspace` was the alternative and is refused (card
 * decision A). That UI is consultancy chrome — an org rail, a team page, settings, a
 * student LIST — built on the premise that every reader is staff, so reuse would mean
 * enforcing `case.notes.internal: "deny"` component by component. **The reuse is the
 * leak.** This gate starts from "show only what this student may see" instead of
 * subtracting from "show everything".
 *
 * ## The four outcomes, kept apart
 *
 * - **A denial is `notFound()`**, and "not linked", "unknown case" and "revoked" are
 *   the SAME answer. `getCaseContext` already refuses to distinguish them; a route
 *   that did would be an enumeration oracle for a consultancy's case ids.
 * - **A failed check is an OUTAGE.** "You may not see this" is a claim about the
 *   viewer, and making it because a query errored tells a student the case they
 *   created an account for does not exist — with nothing to retry on a 404
 *   (MISTAKES.md: `lookup-failed` is always an outage).
 * - **A PERSONAL case is `notFound()`.** A student passes `case.read` at `linked` on
 *   their own personal case, so permission alone would let it render under a heading
 *   that says a consultancy holds it. That is the founder decision of 2026-08-24
 *   expressed as routing, and it is the same reasoning `./case-route.ts` gives for
 *   refusing a case from another organization: not a leak, but a URL that lies about
 *   which workspace is on screen.
 * - **STAFF are `notFound()` too.** A counsellor holds `case.read` on cases they are
 *   assigned, so the claim alone cannot tell the student's door from the
 *   consultancy's. The gate asks for the STUDENT grant specifically. A DUAL-ROLE
 *   actor — staff of the organization who is also this case's student — still gets
 *   in, because the two grants are additive and they hold their own case as a data
 *   subject rather than as staff (`./README.md` §"The dual-role rule").
 *
 * ## Why the id is format-checked first
 *
 * Before a client exists and before any query — `cases.id` is a `uuid`, so a
 * malformed segment never reaches a policy decision: Postgres raises `22P02` inside
 * the permission lookup, `getCaseContext` reports it as `lookup-failed`, and the
 * caller would render an OUTAGE. `/consultancy/xyz` would blame the server while
 * `/consultancy/<a real uuid>` correctly 404'd — exactly the wrong way round.
 */

/** The one spelling of the student's consultancy surface. */
export const STUDENT_CASE_ROUTE_BASE = "/consultancy";

/**
 * `/consultancy/<case>` — every link and redirect in the route.
 *
 * NO ORGANIZATION SEGMENT, unlike `caseRouteBase`. Decision A requires a URL that
 * does not imply the student is inside the consultancy's workspace, and the
 * organization id would do exactly that. It would also be unusable to them:
 * `organizations_select_member` admits only actual members, so a student cannot read
 * the organization's row at all and there is nothing for the id to name.
 */
export function studentCaseRoutePath(caseId: string): string {
  return `${STUDENT_CASE_ROUTE_BASE}/${caseId}`;
}

export type StudentCaseGate =
  | {
      ok: true;
      /**
       * The AUTHENTICATED client, returned rather than re-created by each panel so
       * the reads provably run as the signed-in user. `actor_case_ids()` — the
       * predicate behind every `_select_actor` policy this surface reads through —
       * is evaluated from `auth.uid()`, so a service-role read here would render
       * the same markup with the tenant boundary switched off.
       */
      supabase: SupabaseClient<Database>;
      userId: string;
      caseId: string;
      /**
       * The case's organization, non-null by construction: a personal case is
       * refused above. Carried because it is the fact that separates the two cases,
       * never so it can be rendered — the student cannot read the organization's
       * name and this surface does not try.
       */
      organizationId: string;
    }
  | { ok: false; outage: "access" };

export async function openStudentCaseRoute(caseId: string): Promise<StudentCaseGate> {
  // FIRST, before a client exists and before any query — see the header.
  if (!isWellFormedId(caseId)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/auth?next=${encodeURIComponent(studentCaseRoutePath(caseId))}`);
  }

  const { decision, context } = await checkCasePermission(
    data.user.id,
    caseId,
    "case.read",
    supabase,
  );
  if (!decision.allowed) {
    if (decision.reason === "lookup-failed") return { ok: false, outage: "access" };
    notFound();
  }

  // A personal case, and a case this actor reaches only as staff, are both the wrong
  // door — and both answer with the one refusal above, so neither is distinguishable
  // from "no such case".
  if (context.organizationId === null) notFound();
  if (!context.grantedRoles.includes("student")) notFound();

  return {
    ok: true,
    supabase,
    userId: data.user.id,
    caseId,
    organizationId: context.organizationId,
  };
}
