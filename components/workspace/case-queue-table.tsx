import type { QueueCase } from "@/lib/cases/queue";
import { CaseQueueRow } from "./case-queue-row";

/**
 * The dense semantic queue (spec §2): a real `<table>`, one hairline divider per
 * row, no cards, no row animation. Wide content scrolls inside this container;
 * below `md` the table flattens to bordered blocks via the row's own classes.
 * The assignee column exists only for viewers whose scope is the organization.
 */
export function CaseQueueTable({
  rows,
  organizationId,
  canAssign,
  showAssignee,
}: {
  rows: QueueCase[];
  organizationId: string;
  canAssign: boolean;
  showAssignee: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left max-md:block">
        <thead className="max-md:hidden">
          <tr className="border-b border-line-2">
            <th scope="col" className="py-2 pr-4 text-meta font-medium text-ink-soft">
              Student
            </th>
            {/* Stage 4 shipped the data, so the column is available (spec §2). The
                visa read's column stays omitted entirely until its stage ships —
                forty rows of "Coming soon" is worse than no column. */}
            <th scope="col" className="py-2 pr-4 text-meta font-medium text-ink-soft">
              Lodgement
            </th>
            <th scope="col" className="py-2 pr-4 text-meta font-medium text-ink-soft">
              Next action
            </th>
            <th scope="col" className="py-2 pr-4 text-meta font-medium text-ink-soft">
              Status
            </th>
            {showAssignee ? (
              <th scope="col" className="py-2 pr-4 text-meta font-medium text-ink-soft">
                Assignee
              </th>
            ) : null}
            <th scope="col" className="py-2 text-meta font-medium text-ink-soft">
              Updated
            </th>
          </tr>
        </thead>
        <tbody className="max-md:block">
          {rows.map((row) => (
            <CaseQueueRow
              key={row.id}
              row={row}
              organizationId={organizationId}
              canAssign={canAssign}
              showAssignee={showAssignee}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
