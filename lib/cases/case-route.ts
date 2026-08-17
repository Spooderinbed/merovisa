import "server-only";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionScope } from "./permissions";
import { checkCasePermission } from "./require-permission";
import { readOrgCase, type OrgCaseDetail } from "./write-repo";
import { isWellFormedId } from "./path-ids";

/**
 * `openCaseRoute` — the gate every page of the case route passes through
 * (access-matrix cell 13).
 *
 * Seven pages ask the same four questions in the same order, and the order is the
 * point: **authorize, then read.** A page that loads the case row first has
 * already reached for a student's data by the time it asks whether it was allowed
 * to, and no assertion on what it renders would notice.
 *
 * ## The three outcomes, kept apart
 *
 * MV-171's manage page established this and the reasoning carries verbatim:
 *
 * - **A denial is `notFound()`.** Confirming that a case exists but is not yours
 *   is an enumeration oracle; `getCaseContext` already refuses to distinguish "no
 *   such case" from "not yours", and a page must not undo that.
 * - **A failed check or read is an OUTAGE.** "You may not see this" is a claim
 *   about the viewer, and making it because a query errored sends a legitimate
 *   counsellor to ask a colleague for access they already hold. The caller
 *   renders it; there is nothing to retry on a 404.
 * - **A case in a different organization is `notFound()`.** Authorization is per
 *   case, so this is not a leak — but rendering org A's case under org B's URL
 *   makes the URL lie about which tenant is on screen.
 *
 * ## Why the id is format-checked first
 *
 * `cases.id` is a `uuid`, so a malformed segment never reaches a policy decision:
 * Postgres raises `22P02` inside the permission lookup, `getCaseContext` reports
 * it as `lookup-failed`, and the page would render the OUTAGE. So `/students/xyz`
 * blamed the server while `/students/<a real uuid>` correctly 404'd — exactly the
 * wrong way round (`lib/cases/path-ids.ts` states the same for API routes).
 *
 * ## The client it returns
 *
 * The **authenticated** one, and it is returned rather than re-created by each
 * page so that the panels provably read as the signed-in user. Cell 13 is
 * `*_select_case` → `actor_case_ids()` on all nine tables; a service-role read
 * here would render the same markup with the tenant boundary switched off.
 */

export type CaseRouteGate =
  | {
      ok: true;
      supabase: SupabaseClient<Database>;
      caseRow: OrgCaseDetail;
      /**
       * What `getCaseContext` published about HOW this actor reaches the case —
       * the same fact `can_staff_case` decides on. The persistent frame needs it
       * to tell a staff viewer from the linked student before deciding whether to
       * read who is assigned (`./case-frame.ts`); nothing here is a second gate.
       */
      grantedRoles: readonly string[];
      /**
       * The scope `case.read` was granted at. `all-org` readers are exactly the
       * owner/admin set that holds `case.assign` under the current matrix, which
       * is how the case overview decides whether "Assign a counsellor" is an
       * action this viewer can take — the same reading the Day view makes from
       * `case.list`, and for the same reason: a second round trip here would buy a
       * second failure mode, not a second lock. Everything it gates is
       * presentation; `/manage` re-decides and `cases_update_admin` decides again.
       */
      scope: PermissionScope | null;
    }
  | { ok: false; outage: "access" | "case" };

/** `/workspace/<org>/students/<case>` — every link and redirect in the route. */
export function caseRouteBase(organizationId: string, caseId: string): string {
  return `/workspace/${organizationId}/students/${caseId}`;
}

export async function openCaseRoute(
  organizationId: string,
  caseId: string,
  subPath = "",
): Promise<CaseRouteGate> {
  // FIRST, before a client exists and before any query — see the header.
  if (!isWellFormedId(caseId) || !isWellFormedId(organizationId)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/auth?next=${encodeURIComponent(caseRouteBase(organizationId, caseId) + subPath)}`);
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

  const result = await readOrgCase(caseId, supabase);
  if (!result.ok) return { ok: false, outage: "case" };
  if (!result.data || result.data.organizationId !== organizationId) notFound();

  return {
    ok: true,
    supabase,
    caseRow: result.data,
    grantedRoles: context.grantedRoles ?? [],
    scope: decision.requiredScope,
  };
}
