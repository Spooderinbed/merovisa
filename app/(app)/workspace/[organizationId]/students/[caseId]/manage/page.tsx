import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { readOrgCase, readPrimaryCounsellor } from "@/lib/cases/write-repo";
import { listOrgMembers } from "@/lib/org/repo";
import { MEMBERSHIP_ROLES } from "@/lib/cases/permissions";
import { operationalStatusLabel } from "@/lib/cases/operational-status";
import {
  CaseManageControls,
  type CaseManageMember,
} from "@/components/workspace/case-manage-controls";
import { Card } from "@/components/ui/card";

/**
 * Access-matrix cells 9 and 10 — hand a case to one primary counsellor, and move
 * its operational status.
 *
 * **This is MV-171's surface, not a preview of MV-172's case route.** It carries
 * the status and the assignment and nothing else: no profile, no matches, no
 * plan, no documents. It is named `.../students/[caseId]/manage` precisely so it
 * cannot collide with the case route MV-172 adds.
 *
 * **Both claims are CASE-scoped**, and they answer differently for the same
 * person: cell 10 gives an assigned counsellor `operational_status`, while F-1
 * (decided 2026-08-10) keeps `case.assign` `deny` for that role. So the two are
 * asked separately and each control is rendered on its own answer, rather than one
 * gate standing in for both.
 *
 * **The case is checked against the organization in the URL.** Authorization is
 * per case, so a case from another organization would not be a leak — but it would
 * render under this organization's URL with an assignment picker full of members
 * `is_case_org_member` would refuse.
 *
 * Three outcomes, three renderings, and they must never collapse: a denial is
 * `notFound()`, a failed check or read is an outage, and a case that does not
 * exist is `notFound()`. **"A failed check" means EITHER of the two**, not both —
 * asking two questions and only reporting the failure when both fail is how the
 * mixed answer became a page that silently dropped one control.
 *
 * **Two things this page will not say.** Who staffs the case, to a viewer who is
 * not staff on it — the linked student holds `case.update` and so reaches here,
 * but `case_assignments_select_accessor` refuses them with zero rows, which is
 * indistinguishable from an unassigned case, so the read is not made rather than
 * misreported. And a status control on an ARCHIVED case, because un-archiving is
 * Stage 6's and the change would have no way back.
 */
export default async function ManageCasePage({
  params,
}: {
  params: Promise<{ organizationId: string; caseId: string }>;
}) {
  const { organizationId, caseId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/auth?next=/workspace/${organizationId}/students/${caseId}/manage`);
  }

  const update = await checkCasePermission(data.user.id, caseId, "case.update", supabase);
  const assign = await checkCasePermission(data.user.id, caseId, "case.assign", supabase);
  const canUpdateStatus = update.decision.allowed;
  const canAssign = assign.decision.allowed;

  /**
   * EITHER check failing is an outage — not just both of them.
   *
   * This used to sit inside `if (!canUpdateStatus && !canAssign)`, which meant the
   * mixed answer was the one it could not report: `case.update` allowed while
   * `case.assign` could not be answered rendered the page normally with the
   * assignment control silently absent, indistinguishable from "you are a
   * counsellor, who may not assign". The admin then sees a surface that looks
   * complete and is not, which is worse than an error page — there is nothing to
   * retry, because nothing said anything went wrong.
   *
   * A `lookup-failed` on an ALLOWED decision cannot happen (its reason is null), so
   * this reads only the reasons of decisions that actually denied.
   */
  if (update.decision.reason === "lookup-failed" || assign.decision.reason === "lookup-failed") {
    return <Outage organizationId={organizationId} heading="We couldn't check your access" />;
  }
  if (!canUpdateStatus && !canAssign) notFound();

  /**
   * Is this viewer STAFF on the case, or the student it belongs to?
   *
   * It matters because `CASE_PERMISSION_MATRIX.student["case.update"]` is `linked`,
   * so the linked student passes the gate above — while
   * `case_assignments_select_accessor` admits only
   * `actor_assigned_case_ids() or can_staff_case(case_id)`. An RLS refusal is ZERO
   * ROWS AND NO ERROR, so their roster read came back `{ok: true, data: null}` and
   * the page told them "No counsellor is assigned to this student yet" — a denial
   * wearing the empty-result answer, and a false claim about a case that may well
   * have a counsellor.
   *
   * The two are indistinguishable after the read, so the answer is not to make it.
   * Which is also the rule the migration states: who staffs a case is
   * "consultancy-internal operating data" and "the student link must not confer
   * org-scoped rights" (`…20260730180000….sql`, divergence 6).
   *
   * `grantedRoles` is the authorization fact `getCaseContext` publishes for exactly
   * this and mirrors `can_staff_case`; it is read from whichever check ALLOWED,
   * because a denial hands back the grants-nothing context.
   */
  const grantedRoles: readonly string[] =
    (canUpdateStatus ? update.context.grantedRoles : assign.context.grantedRoles) ?? [];
  const isStaffOnCase = grantedRoles.some((role) =>
    (MEMBERSHIP_ROLES as readonly string[]).includes(role),
  );

  const caseResult = await readOrgCase(caseId, supabase);
  if (!caseResult.ok) {
    return <Outage organizationId={organizationId} heading="We couldn't load this student" />;
  }
  if (!caseResult.data || caseResult.data.organizationId !== organizationId) notFound();
  const caseRow = caseResult.data;

  /**
   * Archiving is Stage 6's, and until it exists an archived case is a record that
   * has been put away with no way back. Offering the operational-status control on
   * one would offer a change nobody can reverse — and the list already shows this
   * state, so the one surface that offers to CHANGE the case was the only one not
   * mentioning it was closed off.
   */
  const isArchived = caseRow.archivedAt !== null;

  // Not read at all for a non-staff viewer — see `isStaffOnCase` above.
  const primary = isStaffOnCase ? await readPrimaryCounsellor(caseId, supabase) : null;
  const currentUserId = primary?.ok ? (primary.data?.userId ?? null) : null;

  // The member list is read ONLY when there is a control to put it in. A viewer
  // who may not assign has no use for it, and asking for it anyway would be a
  // query issued on behalf of a control that is not rendered.
  let members: CaseManageMember[] = [];
  let memberListFailed = false;
  if (canAssign) {
    const list = await listOrgMembers(organizationId, supabase);
    if (!list.ok) {
      memberListFailed = true;
    } else {
      members = list.data
        // Active only: `is_case_org_member` requires an active membership, so an
        // inactive member offered here would fail the insert AFTER the existing
        // assignment had already been deleted.
        .filter((member) => member.status === "active")
        .map((member) => ({
          membershipId: member.id,
          // The same short reference MV-169's team page shows, so an admin can
          // match a picker entry to the person there. Spec F-9: no name is
          // available to `authenticated` and no Stage 3 migration may add one.
          shortReference: member.userId.slice(0, 8),
          role: member.role,
          isCurrent: currentUserId !== null && member.userId === currentUserId,
        }));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href={`/workspace/${organizationId}/students`}
          className="text-meta text-primary underline underline-offset-4"
        >
          ← Students
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[clamp(28px,3.4vw,40px)]">{caseRow.displayName}</h1>
          {/* The same marker the list shows, for the same reason it shows it. */}
          {isArchived ? (
            <span className="inline-flex items-center rounded-pill border border-line bg-bg-tint px-2 py-0.5 text-caption text-ink-soft">
              Archived
            </span>
          ) : null}
        </div>
        <p className="text-meta text-ink-soft">
          {caseRow.email ?? "No email address on file"} ·{" "}
          {operationalStatusLabel(caseRow.operationalStatus)}
          {caseRow.hasLinkedStudent ? " · Self-reported" : " · No student account"}
        </p>
      </header>

      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h2 className="text-title font-medium">Who is working on this student</h2>
        <p className="max-w-[64ch] text-body text-ink-soft">
          {primary === null
            ? // Not staff on this case. The roster was never read, so there is no
              // answer to report — and inventing "nobody is assigned" from a read
              // RLS would have refused is the defect this branch exists to avoid.
              "Who is working on this student is not shown here. The people a consultancy puts on a case are internal to that consultancy."
            : !primary.ok
              ? // A failed read must not wear the "nobody is assigned" answer — it
                // would tell an admin to assign somebody who is already assigned.
                "We couldn't check who is assigned. Something went wrong on our side; please try again in a moment."
              : primary.data === null
                ? "No counsellor is assigned to this student yet."
                : `Assigned to ${primary.data.userId.slice(0, 8)}.`}
        </p>
      </Card>

      <Card as="section" padding="lg" className="flex flex-col gap-4">
        {memberListFailed ? (
          <p className="max-w-[64ch] text-body text-ink-soft">
            We couldn&apos;t load your team, so the counsellor list is unavailable. Something went
            wrong on our side — the status can still be changed.
          </p>
        ) : null}
        {isArchived ? (
          <p className="max-w-[64ch] text-body text-ink-soft">
            This student&apos;s record is archived, so its status cannot be changed here.
            Un-archiving is not built yet.
          </p>
        ) : null}
        <CaseManageControls
          caseId={caseId}
          operationalStatus={caseRow.operationalStatus}
          canUpdateStatus={canUpdateStatus && !isArchived}
          canAssign={canAssign && !memberListFailed}
          members={members}
        />
      </Card>

      <p className="max-w-[64ch] text-caption text-ink-soft">
        This student&apos;s profile, matches, plan and documents are not part of the workspace yet.
        Archiving and inviting the student to sign in are not built.
      </p>
    </div>
  );
}

/** The outage state. Deliberately not `notFound()` — see the header. */
function Outage({ organizationId, heading }: { organizationId: string; heading: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-5 py-10">
      <Link
        href={`/workspace/${organizationId}/students`}
        className="text-meta text-primary underline underline-offset-4"
      >
        ← Students
      </Link>
      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h1 className="text-title font-medium">{heading}</h1>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Something went wrong on our side. This is not a statement about this student or your
          access — please try again in a moment.
        </p>
      </Card>
    </div>
  );
}
