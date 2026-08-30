import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { selectNextStep } from "@/lib/plan/select";
import type { PlanItemRow } from "@/lib/plan/types";
import type { OrgMember } from "@/lib/org/repo";
import type { CaseAuthorizationClient } from "./context";
import { listCaseJudgementsByCase } from "./caseload-judgement-repo";
import { listOutstandingDocumentRequestsByCase } from "./document-requests-repo";
import { deriveQueueLodgement } from "./lodgement";
import { listOrgCases, type CaseListScope } from "./list-repo";
import { PRIMARY_COUNSELLOR_ROLE } from "./write-repo";
import { ACTIVE_MEMBERSHIP_STATUS } from "./permissions";
import type { QueueCase } from "./queue";

/**
 * The Day view's data layer (MV-179, spec §6): `listOrgCases` UNDERNEATH,
 * untouched — cell 7's scope rules are inherited by composition, never
 * re-implemented — plus the three batched enrichments the queue renders:
 * primary assignments, membership standing, and open plan items.
 *
 * THE AUTHENTICATED CLIENT, ALWAYS — same contract as `list-repo.ts`. Every
 * enrichment read is RLS-scoped as the signed-in user: a counsellor's
 * `case_assignments`/`plan_items` reads can only see their own cases' rows, and
 * the roster read is cell 4's permitted view.
 *
 * AN ENRICHMENT THAT FAILED FAILS THE QUEUE. Assignments and plan items decide
 * attention tiers 1 and 6, so a queue rendered without them would be silently
 * MISORDERED — worse than absent (spec §5: a failure that changes ordering fails
 * the queue). `lookup-failed` renders as the outage card, never as emptiness.
 *
 * THE ID LISTS ARE CHUNKED. supabase-js sends `.in()` as URL querystring, and
 * `LIST_ROW_CAP` ids in one URL is a request some proxy will refuse. Plan items
 * chunk SMALLER than assignments, and the chunk size is NOT a guarantee:
 * `plan_items.kind` is unconstrained text and staff hold a case-scoped INSERT
 * policy, so open items per case are bounded by app convention only (the
 * generator's vocabulary), never by the database. PostgREST's `max_rows = 1000`
 * truncates SILENTLY, so a chunk that comes back at the ceiling MAY be a prefix
 * — and a prefix here is wrong next actions and a wrong order with no error.
 * `PLAN_ROW_CEILING` therefore trips that read into `lookup-failed`: the
 * fail-the-queue rule applied to the one truncation PostgREST will not report.
 */

export const QUEUE_BATCH_SIZE = 40;
const PLAN_BATCH_SIZE = 20;
/** PostgREST `max_rows` (supabase/config.toml). A plan read this long may be a silent prefix. */
export const PLAN_ROW_CEILING = 1000;

export type CaseQueueResult =
  | {
      ok: true;
      rows: QueueCase[];
      /** The organization roster, for the assignee facet and workload strip. */
      members: OrgMember[];
      /** `listOrgCases`' own flags, carried through unchanged. */
      scopeIsEmpty: boolean;
      truncated: boolean;
    }
  | { ok: false; reason: "lookup-failed" | "denied" };

const LOOKUP_FAILED = { ok: false, reason: "lookup-failed" } as const;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function listCaseQueue(
  actorUserId: string,
  organizationId: string,
  scope: CaseListScope,
  db?: CaseAuthorizationClient,
): Promise<CaseQueueResult> {
  try {
    const supabase = db ?? (await createSupabaseServerClient());

    // NO FILTERS on the base read: the workload strip counts the whole scope,
    // and the page's view/facet filtering is pure (`./queue`). Search and status
    // therefore run in memory here — same semantics, one honest data set.
    const base = await listOrgCases(actorUserId, organizationId, scope, {}, supabase);
    if (!base.ok) return base;
    if (base.data.length === 0) {
      return {
        ok: true,
        rows: [],
        members: [],
        scopeIsEmpty: base.scopeIsEmpty,
        truncated: base.truncated,
      };
    }

    const caseIds = base.data.map((row) => row.id);

    const memberships = await supabase
      .from("organization_memberships")
      .select("id, user_id, role, status")
      .eq("organization_id", organizationId);
    if (memberships.error) return LOOKUP_FAILED;
    const members: OrgMember[] = (memberships.data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
    }));
    const membershipByUser = new Map(members.map((m) => [m.userId, m]));

    const assigneeByCase = new Map<string, string>();
    for (const ids of chunk(caseIds, QUEUE_BATCH_SIZE)) {
      const assignments = await supabase
        .from("case_assignments")
        .select("case_id, user_id")
        .eq("assignment_role", PRIMARY_COUNSELLOR_ROLE)
        .in("case_id", ids);
      if (assignments.error) return LOOKUP_FAILED;
      for (const row of assignments.data ?? []) {
        assigneeByCase.set(row.case_id, row.user_id);
      }
    }

    const planByCase = new Map<string, PlanItemRow[]>();
    for (const ids of chunk(caseIds, PLAN_BATCH_SIZE)) {
      const plan = await supabase
        .from("plan_items")
        .select("id, case_id, kind, impact, title, status, started_at")
        .eq("status", "todo")
        .in("case_id", ids);
      if (plan.error) return LOOKUP_FAILED;
      const planRows = plan.data ?? [];
      // At the ceiling, PostgREST may have cut the answer without saying so; a
      // possibly-partial plan read renders wrong next actions, so it is an outage.
      if (planRows.length >= PLAN_ROW_CEILING) return LOOKUP_FAILED;
      for (const row of planRows) {
        // `case_id` is nullable in the schema (a legacy owner-keyed item); the
        // `.in()` filter cannot return such a row, and one that somehow arrived
        // belongs to no case in this queue.
        if (row.case_id === null) continue;
        const items = planByCase.get(row.case_id) ?? [];
        // Only the columns `selectNextStep`'s ordering reads travel; the rest are
        // nulled rather than fetched — the queue shows one title, not a plan.
        items.push({
          id: row.id,
          owner: null,
          kind: row.kind,
          impact: row.impact as PlanItemRow["impact"],
          title: row.title,
          body: null,
          liftEstimate: null,
          timeEstimate: null,
          status: row.status as PlanItemRow["status"],
          createdAt: "",
          completedAt: null,
          startedAt: row.started_at,
        });
        planByCase.set(row.case_id, items);
      }
    }

    // The FOURTH enrichment, and the only one that is display-only (MV-183). It
    // decides no attention tier, so a failure here marks its own column as an
    // outage instead of blanking a queue whose every other column is true — spec
    // §5's first option, where the three reads above take its second.
    const requests = await listOutstandingDocumentRequestsByCase(caseIds, supabase);

    /**
     * The FIFTH (MV-200), display-and-sort only, and it takes the fourth's option for
     * the fourth's reason: it decides no attention tier, so a failure marks its own two
     * columns rather than blanking a queue whose every other column is true.
     *
     * A failed read leaves every row `unavailable`, which is also what makes sorting by
     * a judgement column safe when it fails: every row compares equal, so a stable sort
     * leaves the previous order alone rather than inventing one.
     *
     * NOT re-gated per row. `readCaseVisaRisk` returns `null` for a viewer who is not
     * staff on the case, but this queue is staff-only by construction — reaching it at
     * all requires `case.list`, which requires an organization membership role, and a
     * linked student has none. The gate is the route, one level up.
     */
    const judgements = await listCaseJudgementsByCase(
      base.data.map((row) => ({ id: row.id, hasLinkedStudent: row.hasLinkedStudent })),
      supabase,
    );

    const rows: QueueCase[] = base.data.map((summary) => {
      const assigneeUserId = assigneeByCase.get(summary.id);
      const membership = assigneeUserId ? membershipByUser.get(assigneeUserId) : undefined;
      return {
        ...summary,
        assignment:
          assigneeUserId === undefined
            ? null
            : {
                membershipId: membership?.id ?? null,
                userId: assigneeUserId,
                // No membership row at all reads as an unknown, switched-off
                // reference — never dropped, the case still needs assigning.
                role: membership?.role ?? "unknown",
                active: membership?.status === ACTIVE_MEMBERSHIP_STATUS,
              },
        nextStep: selectNextStep(planByCase.get(summary.id) ?? []),
        // A read that FAILED is `unavailable` for every row. It is never spent as
        // an empty list, because "nothing outstanding" and "we could not find out"
        // are different sentences and only one of them is true.
        lodgement: requests.ok
          ? deriveQueueLodgement(requests.byCase.get(summary.id) ?? [])
          : { state: "unavailable" },
        // Same rule, and the same reason it is not an empty answer: "we could not find
        // out" is a different sentence from any judgement, and only one of them is true.
        visaRisk: judgements.ok
          ? (judgements.byCase.get(summary.id)?.visaRisk ?? { state: "unavailable" })
          : { state: "unavailable" },
        submittability: judgements.ok
          ? (judgements.byCase.get(summary.id)?.submittability ?? { state: "unavailable" })
          : { state: "unavailable" },
      };
    });

    return { ok: true, rows, members, scopeIsEmpty: base.scopeIsEmpty, truncated: base.truncated };
  } catch {
    // A thrown client, an aborted request — an answer that never arrived is an
    // outage, never an empty queue.
    return LOOKUP_FAILED;
  }
}
