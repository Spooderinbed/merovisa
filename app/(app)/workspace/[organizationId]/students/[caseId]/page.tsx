import Link from "next/link";
import {
  isStaffOnCase,
  readCaseAssignee,
  readCaseLodgement,
  readCaseNextStep,
  readCaseSubmittability,
  readCaseVisaRisk,
} from "@/lib/cases/case-frame";
import { caseRouteBase, openCaseRoute } from "@/lib/cases/case-route";
import { listCaseInvitations } from "@/lib/cases/invitations-repo";
import { dependsOnPlan, resolveNextAction } from "@/lib/cases/queue";
import { checkCasePermission } from "@/lib/cases/require-permission";
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
 * 1. **Decision strip** — the visa read, the evidence read and the lodgement read.
 *    MV-183 shipped the chase list, MV-198 the visa half, MV-199 the requirement
 *    rollup that gives the strip its first truthful denominator.
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

  const viewerIsStaff = isStaffOnCase(gate.grantedRoles);

  const assignee = await readCaseAssignee(
    caseId,
    organizationId,
    { isStaffOnCase: viewerIsStaff },
    gate.supabase,
  );
  const nextStep = await readCaseNextStep(caseId, gate.supabase);
  // Its own failure, and its own outage note. A failed lodgement read does not
  // affect any other sentence on this page, so the rest is still stated truthfully
  // (spec §5: "a failed future judgement or document read affects its panel only
  // when the rest of the case can still be stated truthfully").
  const lodgement = await readCaseLodgement(caseId, gate.supabase);
  // Its own failure and its own panel too (MV-198). Staff-only and self-gating: a
  // non-staff viewer gets `null` and the region simply does not render, rather than a
  // withheld panel announcing that a judgement about them exists.
  const visaRisk = await readCaseVisaRisk(
    caseId,
    { isStaffOnCase: viewerIsStaff, hasLinkedStudent: caseRow.hasLinkedStudent },
    gate.supabase,
  );
  // MV-199, and the same self-gating shape. Deliberately NOT conditioned on
  // `hasLinkedStudent`: this read judges the case's documents, which a
  // consultancy-entered case has from the first upload (`readCaseSubmittability`
  // carries the reasoning).
  const submittability = await readCaseSubmittability(
    caseId,
    { isStaffOnCase: viewerIsStaff },
    gate.supabase,
  );

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

  /**
   * MV-193 — the invitation panel's own two reads, taken only when it renders.
   *
   * A LINKED case drops the panel entirely, and neither read is worth a round trip for a
   * case that will not show it.
   *
   * `case.invite_student` is asked for EXPLICITLY rather than derived from `gate.scope`.
   * Under the current matrix everyone who can open an unlinked case also holds it, so the
   * two agree today — but they are different questions, and inferring one from the other
   * is how a matrix change silently offers a control the route will then refuse. What it
   * gates is presentation; the route re-decides and `invitations_insert_staff` decides
   * again.
   */
  const showInvite = !caseRow.hasLinkedStudent;
  const invitePermission = showInvite
    ? await checkCasePermission(gate.userId, caseId, "case.invite_student", gate.supabase)
    : null;
  // Its own failure and its own sentence. A failed invitation read leaves exactly the
  // shape of the benign answer — a case nobody has invited — and that is the one wrong
  // sentence that gets a second link minted for a student who already has one.
  const invitations = showInvite ? await listCaseInvitations(caseId, gate.supabase) : null;

  return (
    <div className="flex flex-col gap-6 px-5 py-10">
      <CaseDecisionStrip
        base={base}
        lodgement={lodgement}
        visaRisk={visaRisk}
        submittability={submittability}
      />

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <div className="flex flex-col gap-4">
          {showInvite ? (
            <CaseInviteBlock
              caseId={caseId}
              hasEmail={caseRow.email !== null && caseRow.email.trim() !== ""}
              caseEmail={caseRow.email}
              isNextAction={invitationIsTheAction}
              invitations={invitations?.ok ? invitations.data : []}
              canInvite={invitePermission?.decision.allowed ?? false}
              // A read that FAILED, not one that found nothing. `invitations === null`
              // cannot occur while `showInvite` is true; it is spelled out rather than
              // asserted away so the two absences stay distinguishable if that changes.
              listFailed={invitations === null || !invitations.ok}
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
