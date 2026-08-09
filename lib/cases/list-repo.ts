import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseAuthorizationClient } from "./context";
import { isOperationalStatus } from "./operational-status";

/**
 * The org-scoped student list — access-matrix cell 7 (spec §4).
 *
 * THE AUTHENTICATED CLIENT, ALWAYS. Row Level Security evaluated as the signed-in
 * user is the tenant boundary; this module is defense in depth on top of it
 * (`./README.md`). It never imports `createSupabaseAdminClient`. The optional
 * client parameter exists so tests can inject a fake — never so a caller can
 * substitute a wider one.
 *
 * NO SQL SHIPS WITH THIS MODULE. `grant select on public.cases` and
 * `grant select on public.case_assignments` are table-level and live
 * (20260730180000_case_aware_rls_policies.sql:684-685), and the row predicates
 * are `cases_select_accessor` (:398) and `case_assignments_select_accessor`
 * (:541). Spec §5 forbids Stage 3 from adding or altering a column.
 *
 * ## Why the `assigned` scope is filtered HERE as well as by RLS
 *
 * `cases_select_accessor` reads
 *
 *     student_user_id = auth.uid()  or  admin of the org  or  assigned to the case
 *
 * That first disjunct is not cell 7's. A counsellor who is *also* the linked
 * student of some case in the same organization passes it, so RLS alone would put
 * that case in their staff list. Cell 7 gives a counsellor **assigned only**, so
 * the assignment set is intersected in this layer too. Deleting that intersection
 * widens cell 7 without any SQL test going red — which is why
 * `tests/cases/list-repo.test.ts` asserts it against a fixture rather than
 * trusting the policy.
 *
 * ## Where each filter is applied, and why they differ
 *
 * - **Status** is applied by the database. Its value comes from a closed,
 *   check-constrained vocabulary and is validated against it first, so nothing
 *   user-shaped reaches the query.
 * - **The search term is applied here, in TypeScript.** It is free text, and it
 *   has to span two columns — which PostgREST expresses only through the `.or()`
 *   string DSL, where the term is filter *structure* rather than a bound value. A
 *   comma or a parenthesis typed into a search box would change the shape of the
 *   query. Matching in memory also means `%` and `_` are characters rather than
 *   `LIKE` wildcards, so a search for `100%` cannot quietly return everybody.
 *
 * **The result set is bounded by the organization and nothing else.** That is
 * honest for Stage 3, which runs on seeded data with no consultancy onboarded
 * (spec §9.3); pagination is earned by Stage 7's pilot, and is recorded on
 * MV-170's card rather than pre-built.
 */

/** The scopes cell 7 defines. `linked` is a student's own case and is not a list. */
export type CaseListScope = "all-org" | "assigned";

export interface CaseListFilters {
  /** Free text matched against the student's name and email. Blank means "no search". */
  query?: string;
  /** One of `OPERATIONAL_STATUSES`; anything else is ignored rather than queried. */
  status?: string;
}

/**
 * One case, as the list renders it.
 *
 * `student_user_id` is read and **not carried**: a raw Auth user id is no use to a
 * counsellor and does not belong in markup. What the surface needs from it is the
 * boolean below.
 */
export interface OrgCaseSummary {
  id: string;
  displayName: string;
  email: string | null;
  operationalStatus: string;
  /**
   * `student_user_id IS NOT NULL` — which is exactly "a student can edit this
   * case's `display_name` and `email`", because `cases_update_accessor`'s student
   * disjunct is `student_user_id = (select auth.uid())` (…20260730180000….sql:432).
   * Spec F-3: the list marks it so a counsellor cannot be deceived by a name the
   * student wrote. There is no provenance column, so "a student *did* edit this"
   * is not knowable and is not claimed.
   */
  hasLinkedStudent: boolean;
  archivedAt: string | null;
}

export type CaseListResult =
  | { ok: true; data: OrgCaseSummary[] }
  | { ok: false; reason: "lookup-failed" | "denied" };

const LOOKUP_FAILED = { ok: false, reason: "lookup-failed" } as const;
const DENIED = { ok: false, reason: "denied" } as const;

function isPresent(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Substring, case-insensitive, over the two identity columns. Never a `LIKE` pattern. */
function matches(row: OrgCaseSummary, term: string): boolean {
  const needle = term.toLowerCase();
  return (
    row.displayName.toLowerCase().includes(needle) ||
    (row.email ?? "").toLowerCase().includes(needle)
  );
}

export async function listOrgCases(
  actorUserId: string,
  organizationId: string,
  scope: CaseListScope,
  filters: CaseListFilters = {},
  db?: CaseAuthorizationClient,
): Promise<CaseListResult> {
  // A blank identifier can only come from a bug or a probe; neither earns a query.
  if (!isPresent(actorUserId) || !isPresent(organizationId)) return LOOKUP_FAILED;

  // The runtime half of "read the returned scope". `checkOrgPermission` hands the
  // caller a `PermissionScope`, and a cast — or a future matrix edit giving some
  // role a scope this function has no query for — must deny rather than fall
  // through to the widest branch. Same discipline as `decideOrgPermission`'s
  // re-check of the entry-point split.
  if (scope !== "all-org" && scope !== "assigned") return DENIED;

  try {
    const supabase = db ?? (await createSupabaseServerClient());

    let assignedCaseIds: Set<string> | null = null;
    if (scope === "assigned") {
      const assignments = await supabase
        .from("case_assignments")
        .select("case_id")
        .eq("user_id", actorUserId);
      if (assignments.error) return LOOKUP_FAILED;

      assignedCaseIds = new Set((assignments.data ?? []).map((row) => row.case_id));
      // No assignments is a true, complete answer — and reaching the `cases` query
      // with an empty set would ask for the whole organization.
      if (assignedCaseIds.size === 0) return { ok: true, data: [] };
    }

    let query = supabase
      .from("cases")
      .select("id, display_name, email, operational_status, student_user_id, archived_at")
      .eq("organization_id", organizationId);
    if (isOperationalStatus(filters.status)) {
      query = query.eq("operational_status", filters.status);
    }

    const result = await query;
    if (result.error) return LOOKUP_FAILED;

    const term = (filters.query ?? "").trim();
    const data = (result.data ?? [])
      .filter((row) => assignedCaseIds === null || assignedCaseIds.has(row.id))
      .map((row) => ({
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        operationalStatus: row.operational_status,
        hasLinkedStudent: row.student_user_id !== null,
        archivedAt: row.archived_at,
      }))
      .filter((row) => term === "" || matches(row, term))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { ok: true, data };
  } catch {
    // Includes a thrown client, an aborted request, and a client that does not
    // expose `from`. A read that could not complete is a failure, never an empty
    // organization — those two must not render the same.
    return LOOKUP_FAILED;
  }
}
