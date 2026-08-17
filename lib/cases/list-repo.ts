import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseAuthorizationClient } from "./context";
import { isOperationalStatus } from "./operational-status";
import { matchesCaseSearch } from "./queue";

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
 * ## The result set IS capped, and the cap is reported rather than hidden
 *
 * An earlier revision of this comment claimed the read was "bounded by the
 * organization and nothing else". It never was: `supabase/config.toml:18` sets
 * `max_rows = 1000`, so PostgREST truncates every unbounded read — and with no
 * `order by`, at whatever rows the planner happened to emit. A list that silently
 * drops students and then answers "no students match those filters" is a false
 * claim about the organization, which is the one thing this surface must not make.
 *
 * So the read is explicitly ordered and explicitly capped at `LIST_ROW_CAP`, and
 * it asks for `LIST_ROW_CAP + 1` rows: the extra row is what makes "there are more
 * than we are showing" *knowable* rather than guessed. `truncated` carries that up
 * to the page, which says it out loud. Pagination is still Stage 7's (spec §9.3) —
 * this makes the missing pagination visible, it does not build it.
 *
 * Residual, stated rather than hidden: a truncated read cannot prove a scope is
 * empty, so `scopeIsEmpty` is "the rows this read could see hold nothing in
 * scope". Reaching that combination needs a counsellor holding more than
 * `LIST_ROW_CAP` assignments whose cases all sort after the organization's first
 * `LIST_ROW_CAP` by name; the cap notice renders alongside the empty state either
 * way, and Stage 7's pagination retires the question.
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
  /**
   * `cases.updated_at`, carried for the Day view's neglect tie-break (MV-179).
   * Never a deadline — nothing in the schema knows one — and the queue's copy
   * must not present it as one.
   */
  updatedAt: string;
}

export type CaseListResult =
  | {
      ok: true;
      data: OrgCaseSummary[];
      /**
       * True when the actor's scope held no case AT ALL, before either filter ran.
       *
       * The page cannot work this out for itself: from the query string, "an
       * unassigned counsellor searched for a name" and "a search excluded every
       * student there is" look identical, and telling the first one to *clear the
       * filters to see the full list* points at a list that does not exist. This
       * layer is the only one that knows, so it says.
       */
      scopeIsEmpty: boolean;
      /** True when a read hit `LIST_ROW_CAP`, so `data` is a PREFIX of the scope. */
      truncated: boolean;
    }
  | { ok: false; reason: "lookup-failed" | "denied" };

/**
 * The most rows one read of this list returns, well under PostgREST's
 * `max_rows = 1000`. The number is exported because the page states it: "showing
 * the first N" is only honest if the N a reader sees is the N that was applied.
 */
export const LIST_ROW_CAP = 500;

const LOOKUP_FAILED = { ok: false, reason: "lookup-failed" } as const;
const DENIED = { ok: false, reason: "denied" } as const;

/**
 * The rows a capped read may keep, and whether the cap cut it short. Queries ask
 * for `LIST_ROW_CAP + 1`; a row beyond the cap is never returned to the caller,
 * it exists only as proof that more rows are there.
 */
function capped<T>(rows: T[]): { rows: T[]; truncated: boolean } {
  return rows.length > LIST_ROW_CAP
    ? { rows: rows.slice(0, LIST_ROW_CAP), truncated: true }
    : { rows, truncated: false };
}

function isPresent(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// The search predicate lives in `./queue` since MV-179 so the Day view's facet
// and this list cannot drift apart on what a search means.

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
    let truncated = false;

    let assignedCaseIds: Set<string> | null = null;
    if (scope === "assigned") {
      const assignments = await supabase
        .from("case_assignments")
        .select("case_id")
        .eq("user_id", actorUserId)
        .order("case_id", { ascending: true })
        .limit(LIST_ROW_CAP + 1);
      if (assignments.error) return LOOKUP_FAILED;

      const assignmentPage = capped(assignments.data ?? []);
      truncated = assignmentPage.truncated;
      assignedCaseIds = new Set(assignmentPage.rows.map((row) => row.case_id));
      // No assignments is a true, complete answer — and reaching the `cases` query
      // with an empty set would ask for the whole organization.
      if (assignedCaseIds.size === 0) {
        return { ok: true, data: [], scopeIsEmpty: true, truncated };
      }
    }

    // Narrowed once, so the SQL predicate and "was a status applied?" cannot drift.
    const status = isOperationalStatus(filters.status) ? filters.status : undefined;

    let query = supabase
      .from("cases")
      .select("id, display_name, email, operational_status, student_user_id, archived_at, updated_at")
      .eq("organization_id", organizationId);
    if (status !== undefined) {
      query = query.eq("operational_status", status);
    }

    const result = await query.order("display_name", { ascending: true }).limit(LIST_ROW_CAP + 1);
    if (result.error) return LOOKUP_FAILED;

    const page = capped(result.data ?? []);
    truncated = truncated || page.truncated;
    const inScope = page.rows.filter(
      (row) => assignedCaseIds === null || assignedCaseIds.has(row.id),
    );

    const term = (filters.query ?? "").trim();
    const data = inScope
      .map((row) => ({
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        operationalStatus: row.operational_status,
        hasLinkedStudent: row.student_user_id !== null,
        archivedAt: row.archived_at,
        updatedAt: row.updated_at,
      }))
      .filter((row) => term === "" || matchesCaseSearch(row, term))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    let scopeIsEmpty = inScope.length === 0;
    if (scopeIsEmpty && status !== undefined) {
      // The status predicate ran in SQL, so an empty page does not yet separate
      // "this scope holds no case" from "it holds none WITH THIS STATUS" — and the
      // page renders a different sentence for each. One unfiltered read settles it.
      const probe = await supabase
        .from("cases")
        .select("id")
        .eq("organization_id", organizationId)
        .order("display_name", { ascending: true })
        .limit(LIST_ROW_CAP + 1);
      // Answering with either sentence here would be a guess. A read that could
      // not complete is a failure, which the page already renders as one.
      if (probe.error) return LOOKUP_FAILED;

      const probePage = capped(probe.data ?? []);
      truncated = truncated || probePage.truncated;
      scopeIsEmpty = !probePage.rows.some(
        (row) => assignedCaseIds === null || assignedCaseIds.has(row.id),
      );
    }

    return { ok: true, data, scopeIsEmpty, truncated };
  } catch {
    // Includes a thrown client, an aborted request, and a client that does not
    // expose `from`. A read that could not complete is a failure, never an empty
    // organization — those two must not render the same.
    return LOOKUP_FAILED;
  }
}
