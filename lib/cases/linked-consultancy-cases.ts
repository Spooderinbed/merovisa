import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseAuthorizationClient } from "./context";

/**
 * MV-195 — the CONSULTANCY-case resolver (Stage 5 slice 3).
 *
 * The mirror image of `./personal-case.ts`, and deliberately a SECOND function
 * rather than a widened first one.
 *
 * `resolvePersonalCaseId` carries `organization_id IS NULL` **in the predicate**
 * and says why: "a student linked to a consultancy case must not have that case
 * returned here". MV-157 §A makes it the ONLY place a personal route turns an actor
 * into a case id, so the obvious shortcut for this slice — letting it answer with
 * both cases — would silently re-point `/dashboard`, `/profile`, `/matches`,
 * `/plan`, `/documents` and `/checklist` at a workspace the consultancy owns. The
 * resolver is not the seam. This module is.
 *
 * The founder decision of 2026-08-24 is what both predicates encode: a student may
 * hold a personal case AND a consultancy case, and **no data crosses between them**.
 * Neither function may ever answer for the other's half, and
 * `tests/cases/linked-consultancy-cases.test.ts` pins both directions.
 *
 * ## What this does NOT do
 *
 * It does not authorize. Resolution is not permission — every route that acts on an
 * id from here still calls `requireCasePermission` / `checkCasePermission`
 * (`./student-case-route.ts` is the one caller that does, and it is where the gate
 * lives). Handing a route a case id it may not read would be the same defect
 * `resolveTargetCase` exists to prevent, one axis over.
 *
 * THE AUTHENTICATED CLIENT, ALWAYS — the contract every module in `lib/cases/`
 * keeps. `cases_select_accessor` admits `student_user_id = auth.uid()`, so the read
 * below is already bounded by RLS as the signed-in user; the `student_user_id`
 * predicate is defense in depth on top of it, not the boundary.
 */

/**
 * One consultancy case this actor is the student of.
 *
 * `organizationId` is carried because the caller needs to know the case HAS an
 * organization — that is what separates it from the personal case — and not so it
 * can be rendered. A student holds no membership, so `organizations_select_member`
 * refuses them the organization's row entirely: there is no name to print, and the
 * student surface does not try (see `app/(app)/(student)/consultancy/page.tsx`).
 *
 * `displayName`, `email` and `operational_status` are deliberately NOT read. The
 * first two are the student's own details restated by the consultancy and the third
 * is the consultancy's internal pipeline vocabulary ("Ready for review" is a staff
 * judgement about the case, not a fact for its subject).
 */
export interface LinkedConsultancyCase {
  id: string;
  organizationId: string;
  /** `cases.created_at` — the only discriminator a student can read when they hold two. */
  openedAt: string;
}

export type LinkedConsultancyCasesResult =
  | { ok: true; data: LinkedConsultancyCase[] }
  | { ok: false; reason: "lookup-failed" };

/**
 * PostgREST's `max_rows` (supabase/config.toml). A read this long MAY be a silent
 * prefix, and PostgREST does not say so — the same rule `listCaseDocumentRequests`
 * and `queue-repo.ts` apply. A truncated answer here would hide one of a student's
 * own cases behind a page that claims to show them all.
 */
export const LINKED_CASE_ROW_CEILING = 1000;

function isPresent(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Every consultancy case this actor is the linked student of, oldest first.
 *
 * ## `ok: false` means "we could not find out", NOT "you have none" — MV-133
 *
 * The two render as different sentences and only one of them is true. Telling a
 * student who created an account solely to accept an invitation that they have no
 * consultancy case — because a query errored — is the precise lie MV-133 exists to
 * end, and on this surface it lands on the person least able to tell the difference.
 * So the failure is its own variant rather than an empty array.
 */
export async function listLinkedConsultancyCases(
  actorUserId: string,
  db?: CaseAuthorizationClient,
): Promise<LinkedConsultancyCasesResult> {
  // A blank identifier can only come from a bug or a probe; neither earns a query.
  if (!isPresent(actorUserId)) return { ok: true, data: [] };

  try {
    const client = db ?? (await createSupabaseServerClient());
    const { data, error } = await client
      .from("cases")
      .select("id, organization_id, created_at")
      .eq("student_user_id", actorUserId)
      // IN THE PREDICATE, not a post-filter — the mirror image of
      // `resolvePersonalCaseId`'s `.is("organization_id", null)`. A post-filter is a
      // different program: it reads the personal case over the wire and then declines
      // to show it, which leaves the two cases one careless edit apart.
      .not("organization_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(LINKED_CASE_ROW_CEILING);

    if (error) {
      console.error("[cases] linked-consultancy-case lookup failed", { error });
      return { ok: false, reason: "lookup-failed" };
    }
    const rows = data ?? [];
    // At the ceiling the answer MAY be a prefix, and PostgREST does not say so.
    if (rows.length >= LINKED_CASE_ROW_CEILING) return { ok: false, reason: "lookup-failed" };

    return {
      ok: true,
      data: rows.flatMap((row) =>
        // The predicate already excludes it; the guard is what makes the non-null
        // TYPE honest rather than asserted, so nothing downstream can read a
        // personal case out of a field declared to hold an organization.
        row.organization_id === null
          ? []
          : [{ id: row.id, organizationId: row.organization_id, openedAt: row.created_at }],
      ),
    };
  } catch (err) {
    // A dropped connection or an aborted request never answered either, and must
    // not be flattened into "this student has no consultancy case".
    console.error("[cases] linked-consultancy-case lookup threw", { err });
    return { ok: false, reason: "lookup-failed" };
  }
}
