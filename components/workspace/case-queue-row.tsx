import Link from "next/link";
import { resolveNextAction, type QueueCase } from "@/lib/cases/queue";
import { CaseStatusPill } from "./case-status-pill";
import { CaseLinkState } from "./case-link-state";
import { StaffReference } from "./staff-reference";

/**
 * One keyboard-addressable case row (spec §2). The case NAME is the link and the
 * row carries no click handler: navigation stays native, Tab stays complete, and
 * the `j`/`k` shortcuts only move focus between these links
 * (`data-case-queue-link`). Below `md` the row flattens to a bordered block —
 * name and next action first — instead of the retired large-card treatment.
 */
export function CaseQueueRow({
  row,
  organizationId,
  canAssign,
  showAssignee,
}: {
  row: QueueCase;
  organizationId: string;
  canAssign: boolean;
  showAssignee: boolean;
}) {
  const action = resolveNextAction(row, { canAssign });
  return (
    <tr className="border-b border-line align-middle max-md:block max-md:py-3">
      <th
        scope="row"
        className="py-1 pr-4 text-left align-middle font-normal max-md:block max-md:pr-0 max-md:pb-1"
      >
        <Link
          href={`/workspace/${organizationId}/students/${row.id}`}
          data-case-queue-link
          className="block max-w-[32ch] truncate text-control font-medium text-ink underline-offset-4 hover:text-primary hover:underline focus-visible:text-primary"
          title={row.displayName}
        >
          {row.displayName}
        </Link>
        {/* One line, truncating from the email — a wrapped identity cell is how
            56–64px rows quietly become cards again (spec §2 density). */}
        <span className="mt-0.5 flex max-w-[44ch] items-center gap-2 overflow-hidden max-md:flex-wrap">
          <span
            className="min-w-0 truncate text-meta text-ink-soft"
            title={row.email ?? undefined}
          >
            {row.email ?? "No email address on file"}
          </span>
          <span className="shrink-0">
            <CaseLinkState hasLinkedStudent={row.hasLinkedStudent} />
          </span>
          {row.archivedAt !== null ? (
            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-pill border border-line bg-bg-tint px-2 py-0.5 text-caption text-ink-soft">
              Archived
            </span>
          ) : null}
        </span>
      </th>
      <td className="py-1 pr-4 align-middle max-md:block max-md:py-1">
        {/* CSS truncation keeps the full text in the DOM for assistive tech; the
            title carries it for a pointer hover. */}
        <span className="block max-w-[36ch] truncate text-control text-ink" title={action.label}>
          {action.label}
        </span>
      </td>
      <td className="py-1 pr-4 align-middle max-md:inline-block max-md:py-1 max-md:pr-3">
        <CaseStatusPill status={row.operationalStatus} />
      </td>
      {showAssignee ? (
        <td className="py-1 pr-4 align-middle max-md:inline-block max-md:py-1 max-md:pr-3">
          {row.assignment !== null ? (
            <StaffReference
              role={row.assignment.role}
              userId={row.assignment.userId}
              active={row.assignment.active}
            />
          ) : (
            <span className="text-meta text-ink-soft">Unassigned</span>
          )}
        </td>
      ) : null}
      <td className="py-1 align-middle max-md:inline-block max-md:py-1">
        {/* A neglect marker, never a deadline — nothing in the schema knows one. */}
        <time dateTime={row.updatedAt} title={row.updatedAt} className="whitespace-nowrap text-meta text-ink-soft">
          {shortDate(row.updatedAt)}
        </time>
      </td>
    </tr>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `12 Aug 2026` — hand-rolled in UTC so every environment renders one string. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
