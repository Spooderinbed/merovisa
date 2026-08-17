import Link from "next/link";
import type { CaseAssignee } from "@/lib/cases/case-frame";
import type { OrgCaseDetail } from "@/lib/cases/write-repo";
import { CaseLinkState } from "./case-link-state";
import { CaseStatusPill } from "./case-status-pill";
import { StaffReference } from "./staff-reference";

/**
 * Whose case this is, on every route inside it (spec §1, "Persistent case
 * context").
 *
 * MV-172 gave each case page its own heading, which meant the same six facts were
 * assembled seven times and could drift seven ways. This states them once, in the
 * layout, so a counsellor moving between sections never loses the answer to "whose
 * case am I in, and what state is it in".
 *
 * ## The one fact that is deliberately absent
 *
 * The assignee, for a viewer who is not staff on the case. `readCaseAssignee`
 * returns `withheld` and this renders nothing rather than a sentence — the manage
 * page is where "who staffs a case is internal to that consultancy" is explained,
 * and repeating it in a dense identity strip on every route would be noise.
 *
 * ## Why the back link is the Day view
 *
 * Spec §1, "Return behavior". MV-172's shell pointed at `/students`, which is All
 * cases — the searchable directory, a different surface with a different job. The
 * queue is where a counsellor came from and where their remaining work is.
 */
export function CaseContextHeader({
  organizationId,
  caseRow,
  assignee,
}: {
  organizationId: string;
  caseRow: OrgCaseDetail;
  assignee: CaseAssignee;
}) {
  return (
    <section aria-label="Case context" className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-2 px-5 pb-4 pt-8">
        <Link
          href={`/workspace/${organizationId}`}
          className="w-fit text-meta text-primary underline underline-offset-4"
        >
          ← Day view
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[clamp(24px,2.8vw,32px)]">{caseRow.displayName}</h1>
          {caseRow.archivedAt !== null ? (
            <span className="inline-flex items-center whitespace-nowrap rounded-pill border border-line bg-bg-tint px-2 py-0.5 text-caption text-ink-soft">
              Archived
            </span>
          ) : null}
        </div>

        {/* One line of facts, wrapping rather than truncating: this is the strip a
            reader checks before trusting anything below it. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-meta text-ink-soft">
            {caseRow.email ?? "No email address on file"}
          </span>
          <CaseLinkState hasLinkedStudent={caseRow.hasLinkedStudent} />
          <CaseStatusPill status={caseRow.operationalStatus} />
          <Assignee value={assignee} />
        </div>

        {/* Spec §3: the linked case's identity fields are the STUDENT's words. It
            is said next to the name and email rather than in a tooltip, because
            the decision it informs is made while reading them. */}
        {caseRow.hasLinkedStudent ? (
          <p className="text-caption text-ink-soft">Name and email may be self-reported.</p>
        ) : null}
      </div>
    </section>
  );
}

function Assignee({ value }: { value: CaseAssignee }) {
  switch (value.state) {
    case "withheld":
      return null;
    case "unknown":
      // A failed read must not wear the "nobody is assigned" answer — it would
      // tell an admin to assign somebody who already holds the slot.
      return <span className="text-meta text-ink-soft">We couldn&apos;t check who is assigned</span>;
    case "unassigned":
      return <span className="text-meta text-ink-soft">Unassigned</span>;
    case "assigned":
      return <StaffReference role={value.role} userId={value.userId} active={value.active} />;
  }
}
