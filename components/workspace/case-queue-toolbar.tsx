import Link from "next/link";
import {
  QUEUE_VIEWS,
  buildQueueHref,
  DEFAULT_QUEUE_SORT,
  DEFAULT_QUEUE_VIEW,
  type QueueState,
  type QueueView,
} from "@/lib/cases/queue";
import { OPERATIONAL_STATUSES, OPERATIONAL_STATUS_LABELS } from "@/lib/cases/operational-status";
import type { OrgMember } from "@/lib/org/repo";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

/**
 * Queue views and filters (spec §2). The tabs are LINKS — every view is a URL,
 * so Back restores it — and the filters are a native GET form, the students
 * page's proven pattern. The assignee facet travels as a MEMBERSHIP id, never a
 * user id, and both it and the needs-assignment view exist only for viewers who
 * can assign.
 */

const VIEW_LABELS: Record<QueueView, string> = {
  "needs-action": "Needs action",
  all: "All",
  "waiting-on-student": "Waiting on student",
  "ready-for-review": "Ready for review",
  "needs-assignment": "Needs assignment",
};

export function CaseQueueToolbar({
  organizationId,
  state,
  members,
  canAssign,
}: {
  organizationId: string;
  state: QueueState;
  members: OrgMember[];
  canAssign: boolean;
}) {
  const views = canAssign ? QUEUE_VIEWS : QUEUE_VIEWS.filter((v) => v !== "needs-assignment");
  const activeMembers = members.filter((m) => m.status === "active");
  const isFiltered =
    state.query !== "" ||
    state.status !== undefined ||
    state.link !== undefined ||
    state.assignee !== undefined ||
    state.sort !== DEFAULT_QUEUE_SORT;

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Queue views" className="flex flex-wrap gap-1.5">
        {views.map((view) => (
          <Link
            key={view}
            href={buildQueueHref(organizationId, { ...state, view })}
            aria-current={state.view === view ? "page" : undefined}
            className={
              state.view === view
                ? "inline-flex items-center rounded-pill border border-primary px-3 py-1 text-control text-primary"
                : "inline-flex items-center rounded-pill border border-line px-3 py-1 text-control text-ink-soft hover:border-primary hover:text-primary"
            }
          >
            {VIEW_LABELS[view]}
          </Link>
        ))}
      </nav>

      {/* The `key` is the students page's clear-clears-the-controls trick: Clear
          is a soft navigation, and writing `defaultValue` to a mounted control
          changes nothing it displays. */}
      <form
        key={[state.view, state.query, state.status, state.link, state.assignee, state.sort].join("|")}
        method="get"
        className="flex flex-wrap items-end gap-3"
      >
        {state.view !== DEFAULT_QUEUE_VIEW ? (
          <input type="hidden" name="view" value={state.view} />
        ) : null}
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label htmlFor="case-queue-search" className="text-meta text-ink-soft">
            Search
          </label>
          <Input
            id="case-queue-search"
            name="q"
            defaultValue={state.query}
            placeholder="Name or email address"
            data-case-queue-search
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="case-queue-status" className="text-meta text-ink-soft">
            Status
          </label>
          <Select id="case-queue-status" name="status" defaultValue={state.status ?? ""}>
            <option value="">Any status</option>
            {OPERATIONAL_STATUSES.map((value) => (
              <option key={value} value={value}>
                {OPERATIONAL_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="case-queue-link" className="text-meta text-ink-soft">
            Link state
          </label>
          <Select id="case-queue-link" name="link" defaultValue={state.link ?? ""}>
            <option value="">Any</option>
            <option value="linked">Student linked</option>
            <option value="unlinked">No student account</option>
          </Select>
        </div>
        {canAssign ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="case-queue-assignee" className="text-meta text-ink-soft">
              Assignee
            </label>
            <Select id="case-queue-assignee" name="assignee" defaultValue={state.assignee ?? ""}>
              <option value="">Anyone</option>
              <option value="unassigned">Needs assignment</option>
              {activeMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {`${member.role.charAt(0).toUpperCase()}${member.role.slice(1)} · ${member.userId.slice(0, 8)}`}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="case-queue-sort" className="text-meta text-ink-soft">
            Sort
          </label>
          <Select id="case-queue-sort" name="sort" defaultValue={state.sort}>
            <option value="attention">Needs action first</option>
            <option value="name">Name</option>
            <option value="updated">Recently updated</option>
          </Select>
        </div>
        <Button type="submit" size="sm">
          Apply
        </Button>
        {isFiltered ? (
          <Link
            href={buildQueueHref(organizationId, {
              view: state.view,
              query: "",
              status: undefined,
              link: undefined,
              assignee: undefined,
              sort: DEFAULT_QUEUE_SORT,
            })}
            className="text-meta text-primary underline underline-offset-4"
          >
            Clear
          </Link>
        ) : null}
      </form>
    </div>
  );
}
