import type { NextStepSelection } from "@/lib/plan/select";
import { isOperationalStatus, type OperationalStatus } from "./operational-status";

/**
 * The pure half of the Day view (MV-179, spec §2): next-action resolution, the
 * attention sort, queue views, facet filters and the workload counts. No I/O —
 * `lib/cases/queue-repo.ts` fetches the ingredients, this module decides what
 * they mean, and the page only renders.
 *
 * DELIBERATELY NOT `server-only`, for `operational-status.ts`'s reason: nothing
 * here is a scoring rule or a permission — it is what the queue says out loud.
 *
 * Two spec inputs have NO data source yet and are therefore absent rather than
 * stubbed (spec §0): a named judgement/document blocking item (resolution step 6,
 * attention tier 4) slots between the invite steps and the plan-derived ones when
 * a judgement or Stage 4 read exists, and nothing here may claim a deadline —
 * `updatedAt` is a neglect tie-breaker only.
 */

export interface QueueAssignment {
  /** The membership row's id — what the assignee FACET travels as. Null when the
   *  assigned user holds no membership row in this organization. */
  membershipId: string | null;
  userId: string;
  role: string;
  /** The membership's status is `active`. An assignment to a switched-off member
   *  still needs assigning (spec §2, "Needs assignment includes both"). */
  active: boolean;
}

export interface QueueCase {
  id: string;
  displayName: string;
  email: string | null;
  operationalStatus: string;
  hasLinkedStudent: boolean;
  archivedAt: string | null;
  updatedAt: string;
  /** The case's one primary-counsellor slot, or null when nobody holds it. */
  assignment: QueueAssignment | null;
  /** `selectNextStep` over the case's open plan items. */
  nextStep: NextStepSelection;
}

export const NEXT_ACTION_KINDS = [
  "none",
  "assign",
  "review",
  "invite",
  "add-email",
  "plan-item",
  "waiting-on-student",
  "plan-underway",
  "open",
] as const;

export type NextActionKind = (typeof NEXT_ACTION_KINDS)[number];

export interface NextAction {
  kind: NextActionKind;
  label: string;
}

/**
 * The fields the resolution actually reads. The queue passes whole `QueueCase`
 * rows; the case overview (MV-181) has one case and no `updatedAt` on
 * `OrgCaseDetail`, and asking it to invent a sort key to reuse the resolver would
 * be the wrong way round. Structural, so `QueueCase` still satisfies it.
 */
export type NextActionInput = Pick<
  QueueCase,
  "archivedAt" | "operationalStatus" | "assignment" | "hasLinkedStudent" | "email" | "nextStep"
>;

/**
 * Could a plan item have outranked this action?
 *
 * Steps 7 and 9 of the resolution read the plan, so anything resolved BELOW them
 * is only right if the plan read succeeded. A surface whose plan read failed must
 * therefore say it could not work the action out rather than show one of these —
 * MISTAKES.md, silent failures: a failed read must not wear a determined answer.
 * `plan-item` came FROM the plan, so a failed read cannot produce it.
 */
export function dependsOnPlan(kind: NextActionKind): boolean {
  return kind === "waiting-on-student" || kind === "plan-underway" || kind === "open";
}

function hasActiveAssignee(row: NextActionInput): boolean {
  return row.assignment !== null && row.assignment.active;
}

function isClosed(row: { operationalStatus: string }): boolean {
  return row.operationalStatus === "closed";
}

/**
 * Exactly one visible action per row, in spec §2's resolution order. `canAssign`
 * is the viewer, not the case: the "Assign a counsellor" sentence is scoped to
 * owner/admin, and for anyone else the resolution falls through rather than
 * naming an action the viewer cannot take.
 */
export function resolveNextAction(
  row: NextActionInput,
  viewer: { canAssign: boolean },
): NextAction {
  if (row.archivedAt !== null || isClosed(row)) return { kind: "none", label: "No action" };
  if (viewer.canAssign && !hasActiveAssignee(row)) {
    return { kind: "assign", label: "Assign a counsellor" };
  }
  if (row.operationalStatus === "ready_for_review") {
    return { kind: "review", label: "Review the case" };
  }
  if (!row.hasLinkedStudent) {
    // Words only until Stage 5 ships an invitation flow — the caller must not
    // render these as controls (spec §2, "no dead control").
    return row.email !== null && row.email.trim() !== ""
      ? { kind: "invite", label: "Invite the student" }
      : { kind: "add-email", label: "Add an email to invite" };
  }
  // Step 6 — a named blocking item — slots here when a judgement or Stage 4 read exists.
  if (row.nextStep.state === "next" && row.nextStep.item !== null) {
    return { kind: "plan-item", label: row.nextStep.item.title };
  }
  if (row.operationalStatus === "waiting_on_student") {
    return { kind: "waiting-on-student", label: "Waiting on student" };
  }
  if (row.nextStep.state === "waiting") {
    return { kind: "plan-underway", label: "Plan items underway" };
  }
  return { kind: "open", label: "Open the case" };
}

/**
 * Spec §2's attention tiers, 1 = most urgent. Closed (9) and archived (10) are
 * decided first — a closed unassigned case is a closed case, not an assignment
 * emergency. Tier 4 (a named blocking item) has no data source yet and is never
 * produced; the numbering keeps its slot so its arrival reorders nothing else.
 */
export function attentionTier(row: QueueCase): number {
  if (row.archivedAt !== null) return 10;
  if (isClosed(row)) return 9;
  if (!hasActiveAssignee(row)) return 1;
  if (row.operationalStatus === "ready_for_review") return 2;
  if (!row.hasLinkedStudent) return 3;
  if (row.operationalStatus === "new") return 5;
  if (row.nextStep.state === "next") return 6;
  if (row.operationalStatus === "waiting_on_student") return 8;
  return 7;
}

/** The Needs-action boundary: tiers 1–6 ask something of staff; 7–10 do not. */
export function needsAction(row: QueueCase): boolean {
  return attentionTier(row) <= 6;
}

export type QueueSort = "attention" | "name" | "updated";

function byNameThenId(a: QueueCase, b: QueueCase): number {
  return a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id);
}

const COMPARATORS: Record<QueueSort, (a: QueueCase, b: QueueCase) => number> = {
  // Within a tier: `updated_at` OLDEST first — neglect rises. Never a deadline.
  attention: (a, b) =>
    attentionTier(a) - attentionTier(b) ||
    a.updatedAt.localeCompare(b.updatedAt) ||
    byNameThenId(a, b),
  name: byNameThenId,
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || byNameThenId(a, b),
};

export function sortQueue(rows: QueueCase[], sort: QueueSort): QueueCase[] {
  return [...rows].sort(COMPARATORS[sort]);
}

/** Owner/admin tab order. A counsellor's tabs are these minus `needs-assignment`. */
export const QUEUE_VIEWS = [
  "needs-action",
  "all",
  "waiting-on-student",
  "ready-for-review",
  "needs-assignment",
] as const;

export type QueueView = (typeof QUEUE_VIEWS)[number];

/**
 * Spec §2 queue membership. The asymmetry is the spec's own: closed cases are
 * "omitted from the default Day view" and surface under the All TAB, while
 * archived cases "appear only in All cases" — the DIRECTORY at `/students`,
 * which renders the whole scope. Admitting archived rows here would also make
 * the tab named "All" disagree with the strip's "All" count, which excludes
 * them.
 */
export function filterByView(rows: QueueCase[], view: QueueView): QueueCase[] {
  switch (view) {
    case "all":
      return rows.filter((row) => row.archivedAt === null);
    case "needs-action":
      return rows.filter((row) => row.archivedAt === null && needsAction(row));
    case "waiting-on-student":
      return rows.filter(
        (row) => row.archivedAt === null && row.operationalStatus === "waiting_on_student",
      );
    case "ready-for-review":
      return rows.filter(
        (row) => row.archivedAt === null && row.operationalStatus === "ready_for_review",
      );
    case "needs-assignment":
      return rows.filter(
        (row) => row.archivedAt === null && !isClosed(row) && !hasActiveAssignee(row),
      );
  }
}

/**
 * The shared search predicate — substring, case-insensitive, over the two
 * identity columns. `%` and `_` are characters, never `LIKE` wildcards, which is
 * why this stays in memory (`list-repo.ts` explains the whole trade).
 */
export function matchesCaseSearch(
  row: { displayName: string; email: string | null },
  term: string,
): boolean {
  const needle = term.toLowerCase();
  return (
    row.displayName.toLowerCase().includes(needle) ||
    (row.email ?? "").toLowerCase().includes(needle)
  );
}

export interface QueueFacets {
  query?: string;
  status?: OperationalStatus;
  link?: "linked" | "unlinked";
  /** A membership id, or `"unassigned"` for cases without an active assignee. */
  assignee?: string;
}

export function applyQueueFacets(rows: QueueCase[], facets: QueueFacets): QueueCase[] {
  const term = (facets.query ?? "").trim();
  return rows.filter((row) => {
    if (term !== "" && !matchesCaseSearch(row, term)) return false;
    if (facets.status !== undefined && row.operationalStatus !== facets.status) return false;
    if (facets.link === "linked" && !row.hasLinkedStudent) return false;
    if (facets.link === "unlinked" && row.hasLinkedStudent) return false;
    if (facets.assignee !== undefined) {
      if (facets.assignee === "unassigned") {
        if (hasActiveAssignee(row)) return false;
      } else if (row.assignment === null || row.assignment.membershipId !== facets.assignee) {
        return false;
      }
    }
    return true;
  });
}

export interface WorkloadByAssignee {
  membershipId: string | null;
  userId: string;
  role: string;
  count: number;
}

export interface WorkloadSummary {
  /** Every non-archived case in the viewer's scope, closed included. */
  all: number;
  needsAction: number;
  waitingOnStudent: number;
  readyForReview: number;
  /** Missing OR inactive assignee, among open (non-archived, non-closed) cases. */
  needsAssignment: number;
  /** Open cases per ACTIVE assignee, owners first, then admins, then counsellors. */
  byAssignee: WorkloadByAssignee[];
}

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, counsellor: 2 };

export function summarizeWorkload(rows: QueueCase[]): WorkloadSummary {
  const live = rows.filter((row) => row.archivedAt === null);
  const open = live.filter((row) => !isClosed(row));

  const byUser = new Map<string, WorkloadByAssignee>();
  for (const row of open) {
    if (!hasActiveAssignee(row) || row.assignment === null) continue;
    const existing = byUser.get(row.assignment.userId);
    if (existing) {
      existing.count += 1;
    } else {
      byUser.set(row.assignment.userId, {
        membershipId: row.assignment.membershipId,
        userId: row.assignment.userId,
        role: row.assignment.role,
        count: 1,
      });
    }
  }

  return {
    all: live.length,
    needsAction: live.filter(needsAction).length,
    waitingOnStudent: live.filter((row) => row.operationalStatus === "waiting_on_student").length,
    readyForReview: live.filter((row) => row.operationalStatus === "ready_for_review").length,
    needsAssignment: open.filter((row) => !hasActiveAssignee(row)).length,
    byAssignee: [...byUser.values()].sort(
      (a, b) =>
        (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9) || a.userId.localeCompare(b.userId),
    ),
  };
}

export interface QueueState {
  view: QueueView;
  query: string;
  status: OperationalStatus | undefined;
  link: "linked" | "unlinked" | undefined;
  assignee: string | undefined;
  sort: QueueSort;
}

export const DEFAULT_QUEUE_VIEW: QueueView = "needs-action";
export const DEFAULT_QUEUE_SORT: QueueSort = "attention";

/** `?q=a&q=b` reaches a page as `string[]`; the first value keeps it a URL, not a 500. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isQueueView(value: unknown): value is QueueView {
  return typeof value === "string" && (QUEUE_VIEWS as readonly string[]).includes(value);
}

function isQueueSort(value: unknown): value is QueueSort {
  return value === "attention" || value === "name" || value === "updated";
}

/**
 * The query string, validated into state. Junk values are DROPPED to the default
 * rather than queried — same rule as the status filter on the students page. A
 * viewer who cannot assign (`allowAssignee: false`) cannot reach the
 * needs-assignment view or the assignee facet by hand-editing the URL; the parse
 * coerces to the default view, because the queue itself is still theirs to see.
 */
export function parseQueueSearchParams(
  sp: Record<string, string | string[] | undefined>,
  opts: { allowAssignee: boolean },
): QueueState {
  const rawView = first(sp.view);
  const rawLink = first(sp.link);
  const rawSort = first(sp.sort);
  const rawStatus = first(sp.status);
  const rawAssignee = first(sp.assignee);

  let view = isQueueView(rawView) ? rawView : DEFAULT_QUEUE_VIEW;
  if (!opts.allowAssignee && view === "needs-assignment") view = DEFAULT_QUEUE_VIEW;

  return {
    view,
    query: (first(sp.q) ?? "").trim(),
    status: isOperationalStatus(rawStatus) ? rawStatus : undefined,
    link: rawLink === "linked" || rawLink === "unlinked" ? rawLink : undefined,
    assignee:
      opts.allowAssignee && typeof rawAssignee === "string" && rawAssignee.trim() !== ""
        ? rawAssignee
        : undefined,
    sort: isQueueSort(rawSort) ? rawSort : DEFAULT_QUEUE_SORT,
  };
}

/**
 * The canonical URL for a queue state, defaults OMITTED — the default Day view
 * is the bare organization path, and the browser's Back button restores exact
 * filters because this is the only place queue URLs are built.
 */
export function buildQueueHref(organizationId: string, state: QueueState): string {
  const params = new URLSearchParams();
  if (state.view !== DEFAULT_QUEUE_VIEW) params.set("view", state.view);
  if (state.query !== "") params.set("q", state.query);
  if (state.status !== undefined) params.set("status", state.status);
  if (state.link !== undefined) params.set("link", state.link);
  if (state.assignee !== undefined) params.set("assignee", state.assignee);
  if (state.sort !== DEFAULT_QUEUE_SORT) params.set("sort", state.sort);
  const qs = params.toString();
  return `/workspace/${organizationId}${qs === "" ? "" : `?${qs}`}`;
}
