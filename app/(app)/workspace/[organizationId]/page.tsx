import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOrgPermission } from "@/lib/cases/require-org-permission";
import { listCaseQueue } from "@/lib/cases/queue-repo";
import { LIST_ROW_CAP } from "@/lib/cases/list-repo";
import {
  applyQueueFacets,
  buildQueueHref,
  DEFAULT_QUEUE_VIEW,
  filterByView,
  parseQueueSearchParams,
  sortQueue,
  summarizeWorkload,
  type QueueState,
} from "@/lib/cases/queue";
import { Card } from "@/components/ui/card";
import { WorkloadSummary } from "@/components/workspace/workload-summary";
import { CaseQueueToolbar } from "@/components/workspace/case-queue-toolbar";
import { CaseQueueTable } from "@/components/workspace/case-queue-table";
import { CaseQueueShortcuts } from "@/components/workspace/case-queue-shortcuts";

/**
 * MV-179 — the Day view, the organization's landing page: an action-first queue
 * over every case the viewer may see, with one derived next action per row.
 *
 * ACCESS is the students page's, verbatim: `case.list` decided by the matrix, the
 * returned scope narrowed HERE and passed down (a scope this page has no query
 * for denies rather than widening), denial renders `notFound()` for the
 * non-enumeration rule, and `lookup-failed` renders as an outage — never as a
 * denial, never as an empty queue.
 *
 * `canAssign` is derived from the LIST scope rather than asked as a second
 * claim: under the current matrix, `all-org` listers are exactly the owner/admin
 * set that holds `case.assign`, and everything it gates here is presentation —
 * the assign action is a link to the manage surface, which re-decides, and
 * `cases_update_admin` decides again underneath. A second `checkOrgPermission`
 * round trip would buy a second failure mode, not a second lock.
 *
 * QUEUE STATE IS THE URL (`view`/`q`/`status`/`link`/`assignee`/`sort`, defaults
 * omitted): shareable, Back-button-correct, no client state. The privacy cost —
 * a searched name reaches the URL — is the students page's recorded trade, and
 * `lib/analytics/redact-url.ts` keeps it out of PostHog.
 */

export default async function DayViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/auth?next=/workspace/${organizationId}`);

  const list = await checkOrgPermission(data.user.id, organizationId, "case.list", supabase);
  if (!list.decision.allowed) {
    if (list.decision.reason === "lookup-failed") {
      return (
        <DayShell organizationId={organizationId}>
          <QueueFailedCard />
        </DayShell>
      );
    }
    notFound();
  }
  const scope = list.decision.requiredScope;
  if (scope !== "all-org" && scope !== "assigned") notFound();
  const canAssign = scope === "all-org";

  const state = parseQueueSearchParams(sp, { allowAssignee: canAssign });
  const queue = await listCaseQueue(data.user.id, organizationId, scope, supabase);
  if (!queue.ok && queue.reason === "denied") notFound();
  if (!queue.ok) {
    return (
      <DayShell organizationId={organizationId}>
        <QueueFailedCard />
      </DayShell>
    );
  }

  const summary = summarizeWorkload(queue.rows);
  const rows = sortQueue(applyQueueFacets(filterByView(queue.rows, state.view), state), state.sort);
  const hasFacets =
    state.query !== "" ||
    state.status !== undefined ||
    state.link !== undefined ||
    state.assignee !== undefined;

  return (
    <DayShell organizationId={organizationId}>
      <WorkloadSummary summary={summary} scope={scope} />
      <CaseQueueToolbar
        organizationId={organizationId}
        state={state}
        members={queue.members}
        canAssign={canAssign}
      />

      {queue.truncated ? (
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">Showing the first {LIST_ROW_CAP} cases</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            There are more cases here than one page can load. These counts, this order and the
            search only cover the first {LIST_ROW_CAP} by name — they do not cover the whole
            organization. Paging through everything comes later.
          </p>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <QueueEmptyState
          scopeIsEmpty={queue.scopeIsEmpty}
          scope={scope}
          state={state}
          hasFacets={hasFacets}
          organizationId={organizationId}
        />
      ) : (
        <CaseQueueTable
          rows={rows}
          organizationId={organizationId}
          canAssign={canAssign}
          showAssignee={canAssign}
        />
      )}
      <CaseQueueShortcuts />
    </DayShell>
  );
}

/** The page's frame, so an outage renders as this page rather than as a bare card. */
function DayShell({
  organizationId,
  children,
}: {
  organizationId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <Link href="/workspace" className="text-meta text-primary underline underline-offset-4">
          ← All organizations
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[clamp(28px,3.4vw,40px)]">Day view</h1>
          {/* The org rail is MV-180's; until it exists these two links are the way around. */}
          <nav aria-label="Organization pages" className="flex gap-4">
            <Link
              href={`/workspace/${organizationId}/students`}
              className="text-control text-primary underline underline-offset-4"
            >
              All cases
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

/**
 * The four empty states (spec §2), decided from the repository's answer, never
 * from the query string: `scopeIsEmpty` separates "there is nothing" from "the
 * view or filters matched nothing", which are different sentences.
 */
function QueueEmptyState({
  scopeIsEmpty,
  scope,
  state,
  hasFacets,
  organizationId,
}: {
  scopeIsEmpty: boolean;
  scope: "all-org" | "assigned";
  state: QueueState;
  hasFacets: boolean;
  organizationId: string;
}) {
  if (scopeIsEmpty) {
    return scope === "all-org" ? (
      <Card as="section" padding="lg" className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="text-title font-medium">No cases yet</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            Add the first student to start this organization&apos;s work queue.
          </p>
        </div>
        <div>
          <Link
            href={`/workspace/${organizationId}/students/new`}
            className="inline-flex items-center rounded-pill border border-line px-4 py-2 text-control text-ink hover:border-primary"
          >
            Add a student
          </Link>
        </div>
      </Card>
    ) : (
      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h2 className="text-title font-medium">No cases assigned</h2>
        <p className="max-w-[64ch] text-body text-ink-soft">
          An owner or admin needs to assign a student before they appear here.
        </p>
      </Card>
    );
  }

  if (state.view === DEFAULT_QUEUE_VIEW && !hasFacets) {
    return (
      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h2 className="text-title font-medium">Nothing needs action right now</h2>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Waiting and closed cases remain available in All cases.
        </p>
      </Card>
    );
  }

  return (
    <Card as="section" padding="lg" className="flex flex-col gap-2">
      <h2 className="text-title font-medium">No cases match those filters</h2>
      <p className="max-w-[64ch] text-body text-ink-soft">
        <Link
          href={buildQueueHref(organizationId, {
            view: DEFAULT_QUEUE_VIEW,
            query: "",
            status: undefined,
            link: undefined,
            assignee: undefined,
            sort: "attention",
          })}
          className="text-primary underline underline-offset-4"
        >
          Clear the filters
        </Link>{" "}
        to return to the current queue.
      </p>
    </Card>
  );
}

/**
 * One wording for "a read did not complete" — never a statement about the
 * organization, the viewer's access, or an empty queue.
 */
function QueueFailedCard() {
  return (
    <Card as="section" padding="lg" className="flex flex-col gap-2">
      <h2 className="text-title font-medium">We couldn&apos;t load this queue</h2>
      <p className="max-w-[64ch] text-body text-ink-soft">
        Something went wrong on our side. This is not a statement about this organization or your
        access — please try again in a moment.
      </p>
    </Card>
  );
}
