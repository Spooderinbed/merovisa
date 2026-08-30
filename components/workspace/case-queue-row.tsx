import Link from "next/link";
import { LODGEMENT_WORD } from "@/lib/cases/lodgement";
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
        <VisaRiskCell read={row.visaRisk} />
      </td>
      <td className="py-1 pr-4 align-middle max-md:block max-md:py-1">
        <EvidenceCell read={row.submittability} />
      </td>
      <td className="py-1 pr-4 align-middle max-md:block max-md:py-1">
        <LodgementCell read={row.lodgement} />
      </td>
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

/**
 * The Lodgement cell (MV-183, spec §2): "read word plus the single blocking item".
 *
 * ONLY a blocked row is coloured, and only Reach. The queue's batched read fetches
 * OUTSTANDING rows only, so it cannot tell a fully-chased case from one nothing has
 * been asked of — a Strong-green row would claim exactly the difference it does not
 * know. The panel on the case page, which reads the whole request list, is where
 * that distinction is earned. The word carries the meaning in every state; the tint
 * only echoes it.
 */
function LodgementCell({ read }: { read: QueueCase["lodgement"] }) {
  if (read.state === "unavailable") {
    // Never "Nothing outstanding": on a queue that sentence is a counsellor's cue
    // to move on, and it would be a guess.
    return (
      <span
        className="block max-w-[28ch] truncate text-meta text-ink-soft"
        title="We couldn't check this case's document requests."
      >
        Couldn&apos;t check
      </span>
    );
  }

  const blocked = read.state === "blocked";
  return (
    <span className="flex max-w-[32ch] items-center gap-2 overflow-hidden">
      <span
        data-lodgement-word
        className={`shrink-0 whitespace-nowrap text-meta ${blocked ? "text-reach" : "text-ink-soft"}`}
      >
        {LODGEMENT_WORD[read.state]}
      </span>
      {read.state === "blocked" ? (
        // One item. The full title stays in the DOM for assistive tech and rides
        // the title attribute for a pointer hover — the same treatment the next
        // action gets.
        <span className="min-w-0 truncate text-meta text-ink-soft" title={read.blocker.title}>
          · {read.blocker.title}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A cell that could not state its read (MV-200). One wording for both columns, because
 * two would let one drift into sounding like an answer — and the table's own rule is
 * that a read with nothing to say gets a plain sentence, never a placeholder band.
 */
function CouldNotSay({ testId, title }: { testId: string; title: string }) {
  return (
    <span
      data-testid={testId}
      className="block max-w-[28ch] truncate text-meta text-ink-soft"
      title={title}
    >
      Couldn&apos;t check
    </span>
  );
}

/**
 * A sentence that is a real answer, but not a band — no tint, no pill.
 *
 * The test id rides every state, not just the stateable ones, so a cell can be asserted
 * on without the assertion having to know in advance which answer it holds.
 */
function PlainState({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <span data-testid={testId} className="block max-w-[28ch] truncate text-meta text-ink-soft">
      {children}
    </span>
  );
}

/**
 * The Visa read cell (MV-200) — the band word, and nothing else.
 *
 * ONLY `reach` is tinted, which is the sibling Lodgement cell's rule and holds here for
 * its reason: forty coloured rows is a decorated table, not a scannable one. The WORD
 * separates Strong from Possible on every row; the tint is reserved for the one a
 * counsellor should stop at.
 *
 * No conclusion sentence and no factor rows — the panel on the case page is where the
 * read is explained, and a queue that repeated it would be a worse version of it.
 */
function VisaRiskCell({ read }: { read: QueueCase["visaRisk"] }) {
  if (read.state === "unavailable") {
    return <CouldNotSay testId="queue-visa-risk" title="We couldn't read this case's profile." />;
  }
  // Neither of these is a low-risk case; both are the absence of a case to read, and
  // the words say which absence it is.
  if (read.state === "no-linked-student") {
    return <PlainState testId="queue-visa-risk">No linked student</PlainState>;
  }
  if (read.state === "insufficient-data") {
    return <PlainState testId="queue-visa-risk">Not enough recorded</PlainState>;
  }

  return (
    <span
      data-testid="queue-visa-risk"
      className={`block whitespace-nowrap text-meta ${read.band === "reach" ? "text-reach" : "text-ink-soft"}`}
    >
      {VISA_BAND_WORD[read.band]}
    </span>
  );
}

const VISA_BAND_WORD: Record<"strong" | "possible" | "reach", string> = {
  strong: "Strong",
  possible: "Possible",
  reach: "Reach",
};

/**
 * The Evidence cell (MV-200) — the apply-stage count and the one item blocking it.
 *
 * "to apply" is load-bearing, not filler. MV-199's criterion 7 forbids collapsing the
 * apply and lodge stages, and a bare "2 of 6" under a column called Evidence reads as a
 * statement about the whole case. The lodge-stage count is deliberately absent: two
 * fractions in one dense cell is a dashboard, and the panel states both.
 */
function EvidenceCell({ read }: { read: QueueCase["submittability"] }) {
  if (read.state === "unavailable") {
    return <CouldNotSay testId="queue-evidence" title="We couldn't check this case's requirements." />;
  }
  if (read.state === "no-program") return <PlainState testId="queue-evidence">No program</PlainState>;
  if (read.state === "programs-differ") {
    return <PlainState testId="queue-evidence">Programs differ</PlainState>;
  }

  return (
    <span
      data-testid="queue-evidence"
      className="flex max-w-[32ch] items-center gap-2 overflow-hidden"
    >
      <span className="shrink-0 whitespace-nowrap text-meta text-ink-soft">
        {read.apply.ready} of {read.apply.total} to apply
      </span>
      {read.blocker === null ? null : (
        <span className="min-w-0 truncate text-meta text-ink-soft" title={read.blocker.label}>
          · {read.blocker.label}
        </span>
      )}
    </span>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `12 Aug 2026` — hand-rolled in UTC so every environment renders one string. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
