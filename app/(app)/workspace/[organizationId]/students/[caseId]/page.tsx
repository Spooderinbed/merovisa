import Link from "next/link";
import { isStaffOnCase, readCaseAssignee, readCaseNextStep } from "@/lib/cases/case-frame";
import { caseRouteBase, openCaseRoute } from "@/lib/cases/case-route";
import { dependsOnPlan, resolveNextAction } from "@/lib/cases/queue";
import { CaseDecisionStrip } from "@/components/workspace/case-decision-strip";
import { CaseInviteBlock } from "@/components/workspace/case-invite-block";
import { CaseLinkState } from "@/components/workspace/case-link-state";
import { CaseNextAction } from "@/components/workspace/case-next-action";
import { CaseRouteOutage } from "@/components/workspace/case-route-outage";
import { CaseStatusPill } from "@/components/workspace/case-status-pill";
import { StaffReference } from "@/components/workspace/staff-reference";

/**
 * The case overview — spec §3's three zones, in order:
 *
 * 1. **Decision strip** — the visa read and the lodgement read. Renders nothing
 *    yet, and says nothing about that (`case-decision-strip.tsx`).
 * 2. **Primary work area** — the unlinked case's invitation prompt, then exactly
 *    one next action.
 * 3. **Operational rail** — status, assignment, linkage, and the way into Case
 *    details, which is where the first two of those change.
 *
 * ## The next action is the queue's, not a second opinion
 *
 * `resolveNextAction` is MV-179's, unchanged: the row a counsellor clicked in the
 * Day view and the case they landed on resolve the same action from the same
 * rules. A second implementation here would drift, and the drift would be
 * invisible until somebody noticed the queue and the case disagreeing.
 *
 * ## Two reads can make the answer untrue, and the page says so
 *
 * Step 2 reads the assignment; steps 7 and 9 read the plan. Either can fail, and
 * a failure leaves exactly the shape of the benign answer — an unassigned case, a
 * case with nothing on its plan. So each failure is checked against whether this
 * viewer's resolution could have reached it: an admin whose assignment read
 * failed cannot be told "Assign a counsellor", while a counsellor never sees that
 * step and loses nothing.
 *
 * The frame above this page (`./layout.tsx`) states whose case it is; nothing
 * here repeats the name.
 */
export default async function CaseOverviewPage({
  params,
}: {
  params: Promise<{ organizationId: string; caseId: string }>;
}) {
  const { organizationId, caseId } = await params;
  const gate = await openCaseRoute(organizationId, caseId);
  if (!gate.ok) return <CaseRouteOutage organizationId={organizationId} outage={gate.outage} />;

  const caseRow = gate.caseRow;
  // `all-org` readers are exactly the owner/admin set holding `case.assign` under
  // the current matrix — the Day view's reading, and for its reason: everything
  // this gates is presentation, and `/manage` re-decides.
  const canAssign = gate.scope === "all-org";

  const assignee = await readCaseAssignee(
    caseId,
    organizationId,
    { isStaffOnCase: isStaffOnCase(gate.grantedRoles) },
    gate.supabase,
  );
  const nextStep = await readCaseNextStep(caseId, gate.supabase);

  const action = resolveNextAction(
    {
      archivedAt: caseRow.archivedAt,
      operationalStatus: caseRow.operationalStatus,
      hasLinkedStudent: caseRow.hasLinkedStudent,
      email: caseRow.email,
      assignment:
        assignee.state === "assigned"
          ? {
              // The facet's membership id is the queue's concern, not this page's.
              membershipId: null,
              userId: assignee.userId,
              role: assignee.role,
              active: assignee.active,
            }
          : null,
      // `caught-up` only stands in for a read that SUCCEEDED and found nothing;
      // `uncertain` below is what a failed read spends.
      nextStep: nextStep ?? { state: "caught-up", item: null, openCount: 0, waitingCount: 0 },
    },
    { canAssign },
  );

  const uncertain =
    (nextStep === null && dependsOnPlan(action.kind)) ||
    (canAssign && assignee.state === "unknown");

  const base = caseRouteBase(organizationId, caseId);
  const invitationIsTheAction =
    !uncertain && (action.kind === "invite" || action.kind === "add-email");

  return (
    <div className="flex flex-col gap-6 px-5 py-10">
      <CaseDecisionStrip />

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <div className="flex flex-col gap-4">
          {!caseRow.hasLinkedStudent ? (
            <CaseInviteBlock
              hasEmail={caseRow.email !== null && caseRow.email.trim() !== ""}
              isNextAction={invitationIsTheAction}
            />
          ) : null}
          {!invitationIsTheAction ? (
            <CaseNextAction action={action} base={base} uncertain={uncertain} />
          ) : null}
        </div>

        <section
          aria-label="Case operations"
          className="flex flex-col gap-4 rounded-lg border border-line p-5"
        >
          <h2 className="text-control font-medium text-ink">Operations</h2>
          <dl className="flex flex-col gap-3">
            <Row label="Status">
              <CaseStatusPill status={caseRow.operationalStatus} />
            </Row>
            <Row label="Assigned to">
              <Assignee assignee={assignee} />
            </Row>
            <Row label="Student account">
              <CaseLinkState hasLinkedStudent={caseRow.hasLinkedStudent} />
            </Row>
          </dl>
          <Link
            href={`${base}/manage`}
            className="w-fit text-meta text-primary underline underline-offset-4"
          >
            Open case details
          </Link>
        </section>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Assignee({
  assignee,
}: {
  assignee: Awaited<ReturnType<typeof readCaseAssignee>>;
}) {
  switch (assignee.state) {
    case "withheld":
      // Who a consultancy puts on a case is internal to that consultancy.
      return (
        <span className="text-meta text-ink-soft">
          Not shown — who works on a case is internal to the consultancy.
        </span>
      );
    case "unknown":
      return (
        <span className="text-meta text-ink-soft">We couldn&apos;t check who is assigned.</span>
      );
    case "unassigned":
      return <span className="text-meta text-ink-soft">Unassigned</span>;
    case "assigned":
      return (
        <StaffReference
          role={assignee.role}
          userId={assignee.userId}
          active={assignee.active}
        />
      );
  }
}
