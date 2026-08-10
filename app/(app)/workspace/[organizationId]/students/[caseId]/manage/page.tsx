import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { readOrgCase, readPrimaryCounsellor } from "@/lib/cases/write-repo";
import { listOrgMembers } from "@/lib/org/repo";
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
 * exist is `notFound()`.
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

  if (!canUpdateStatus && !canAssign) {
    if (
      update.decision.reason === "lookup-failed" ||
      assign.decision.reason === "lookup-failed"
    ) {
      return <Outage organizationId={organizationId} heading="We couldn't check your access" />;
    }
    notFound();
  }

  const caseResult = await readOrgCase(caseId, supabase);
  if (!caseResult.ok) {
    return <Outage organizationId={organizationId} heading="We couldn't load this student" />;
  }
  if (!caseResult.data || caseResult.data.organizationId !== organizationId) notFound();
  const caseRow = caseResult.data;

  const primary = await readPrimaryCounsellor(caseId, supabase);
  const currentUserId = primary.ok ? (primary.data?.userId ?? null) : null;

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
        <h1 className="text-[clamp(28px,3.4vw,40px)]">{caseRow.displayName}</h1>
        <p className="text-meta text-ink-soft">
          {caseRow.email ?? "No email address on file"} ·{" "}
          {operationalStatusLabel(caseRow.operationalStatus)}
          {caseRow.hasLinkedStudent ? " · Self-reported" : " · No student account"}
        </p>
      </header>

      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h2 className="text-title font-medium">Who is working on this student</h2>
        <p className="max-w-[64ch] text-body text-ink-soft">
          {!primary.ok
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
        <CaseManageControls
          caseId={caseId}
          operationalStatus={caseRow.operationalStatus}
          canUpdateStatus={canUpdateStatus}
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
