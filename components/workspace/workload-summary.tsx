import { Fragment } from "react";
import type { WorkloadSummary as WorkloadCounts } from "@/lib/cases/queue";
import { Card } from "@/components/ui/card";
import { StaffReference } from "./staff-reference";

/**
 * The compact workload strip (spec §2): one bordered line of text counts, and —
 * for owner/admin — open cases per active assignee. No cards, no charts. The
 * counts come from the viewer's whole SCOPE, not from the active filters, so the
 * strip answers "what does today hold" while the table answers the current view.
 */
export function WorkloadSummary({
  summary,
  scope,
}: {
  summary: WorkloadCounts;
  scope: "all-org" | "assigned";
}) {
  const counts: Array<[string, number]> =
    scope === "all-org"
      ? [
          ["All", summary.all],
          ["Needs action", summary.needsAction],
          ["Waiting on student", summary.waitingOnStudent],
          ["Ready for review", summary.readyForReview],
          ["Needs assignment", summary.needsAssignment],
        ]
      : [
          // A counsellor's scope IS their assignments; "All" would claim the org.
          ["Assigned", summary.all],
          ["Needs action", summary.needsAction],
          ["Waiting on student", summary.waitingOnStudent],
          ["Ready for review", summary.readyForReview],
        ];

  return (
    <Card
      as="section"
      radius="card"
      aria-label="Workload"
      className="flex flex-col gap-2 px-4 py-3"
    >
      <p className="text-control text-ink">
        {/* The separator lives OUTSIDE the nowrap span: adjacent nowrap spans with
            no breakable text between them form one unwrappable line, which is a
            horizontal scrollbar at 375px. */}
        {counts.map(([label, count], index) => (
          <Fragment key={label}>
            {index > 0 ? <span className="text-ink-faint"> · </span> : null}
            <span className="whitespace-nowrap">
              {label} <span className="font-medium">{count}</span>
            </span>
          </Fragment>
        ))}
      </p>
      {scope === "all-org" && summary.byAssignee.length > 0 ? (
        <ul aria-label="Workload by assignee" className="flex flex-wrap gap-x-5 gap-y-1">
          {summary.byAssignee.map((assignee) => (
            <li key={assignee.userId} className="text-meta text-ink-soft">
              <StaffReference role={assignee.role} userId={assignee.userId} />{" "}
              <span className="font-medium text-ink">{assignee.count}</span>
            </li>
          ))}
          {summary.needsAssignment > 0 ? (
            <li className="text-meta text-ink-soft">
              Needs assignment <span className="font-medium text-ink">{summary.needsAssignment}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </Card>
  );
}
