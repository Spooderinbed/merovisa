import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOrgPermission } from "@/lib/cases/require-org-permission";
import { MEMBERSHIP_ROLES } from "@/lib/cases/permissions";
import { listOrgMembers } from "@/lib/org/repo";
import { Card } from "@/components/ui/card";
import { TeamMemberRow } from "@/components/workspace/team-member-row";

/**
 * Access-matrix cells 4 and 5 — the team list, with role change and deactivate.
 *
 * TWO CELLS, TWO GATES (MV-180 fix). Cell 4 — read the roster — is `read · read ·
 * read · read`: every ACTIVE member of the organization holds it, a counsellor
 * included, and `organization_memberships_select_member` grants exactly that in
 * SQL. Cell 5 — change a role, switch access off — is owner/admin. This page gated
 * BOTH on `org.manage`, so a counsellor was told the organization does not exist
 * rather than shown the roster the matrix gives them (Stage 3 spec §0).
 *
 * So the read gate is STANDING (`context.isActiveMember`) and the write gate is
 * the CLAIM (`decision.allowed`) — one `checkOrgPermission` call answers both,
 * because it returns the resolved context alongside the decision. Standing is the
 * right gate rather than a new claim: cell 4's enforcement point in the spec is
 * the RLS policy, not a matrix row, and inventing a claim the canonical Stage 1
 * matrix does not contain would put the two layers back out of step.
 *
 * A denial renders `notFound()` rather than a "forbidden" page: telling an actor
 * that an organization exists but is not theirs is an enumeration oracle, and
 * `getOrgContext` already refuses to distinguish "unknown organization" from "not
 * a member" for the same reason.
 *
 * A FAILED permission lookup is not a denial. `checkOrgPermission` preserves
 * `getOrgContext`'s reason so "not a member" and "the membership read errored"
 * stay distinguishable; collapsing them tells an owner their organization does not
 * exist because Supabase blipped. `lookup-failed` renders the outage card this
 * page already has for the equivalent failure one layer down (MV-170 adversarial
 * review, 2026-08-10).
 *
 * There is no invite control. Spec F-5: staff invitations are Stage 5, so this
 * surface manages memberships that already exist and cannot grow the team.
 */

export default async function TeamPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/auth?next=/workspace/${organizationId}/team`);

  const manage = await checkOrgPermission(data.user.id, organizationId, "org.manage", supabase);

  // A FAILED lookup is checked FIRST and on its own. It leaves standing
  // unestablished, so every gate below would read it as a denial — which is how an
  // owner gets told their organization does not exist because Supabase blipped.
  if (!manage.decision.allowed && manage.decision.reason === "lookup-failed") {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
        <TeamLookupFailedCard />
      </div>
    );
  }
  // Cell 4: standing, not the claim. An inactive membership grants nothing
  // (canonical rule 1), so a revoked member reaches no roster.
  if (!manage.context.isActiveMember) notFound();

  // Cell 5. A counsellor reads on and changes nothing, so the owner probe and the
  // role vocabulary are both skipped for them: a second round trip buys a second
  // failure mode, and `roleOptions` would be a control list nothing renders.
  const canManage = manage.decision.allowed;
  const viewerIsOwner = canManage
    ? (await checkOrgPermission(data.user.id, organizationId, "org.settings", supabase)).decision
        .allowed
    : false;

  // Computed HERE, on the server. `lib/cases/permissions` is `server-only` because
  // the permission matrix is server business logic that must never be readable in
  // client JS, so the row component receives the option list rather than importing
  // the module that defines it.
  const roleOptions = canManage
    ? MEMBERSHIP_ROLES.filter((option) => viewerIsOwner || option !== "owner")
    : [];

  const members = await listOrgMembers(organizationId, supabase);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Team</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          {canManage
            ? "Change what someone can do, or switch off their access. Deactivating keeps their record — it does not delete their history."
            : "Who is in this organization, and what each person can do. Changing roles and access is an owner or admin action."}
        </p>
      </header>

      {/* Spec F-5, and a manager's sentence: telling a counsellor that this page
          manages memberships would describe a surface they do not have. */}
      {canManage ? (
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">Adding people comes later</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            Invitations are not built yet. For now, new team members are added by MeroVisa — this
            page manages the people who are already here.
          </p>
        </Card>
      ) : null}

      {!members.ok ? (
        <TeamLookupFailedCard />
      ) : (
        <Card as="section" padding="lg" className="flex flex-col">
          {members.data.map((member) => (
            <TeamMemberRow
              key={member.id}
              organizationId={organizationId}
              membershipId={member.id}
              userId={member.userId}
              role={member.role}
              status={member.status}
              isSelf={member.userId === data.user.id}
              canManage={canManage}
              viewerIsOwner={viewerIsOwner}
              roleOptions={roleOptions}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

/**
 * One wording for "a read did not complete", shared by the failed permission
 * lookup and the failed roster read so neither can drift into sounding like a
 * statement about the actor's access.
 */
function TeamLookupFailedCard() {
  return (
    <Card as="section" padding="lg" className="flex flex-col gap-2">
      <h2 className="text-title font-medium">We couldn&apos;t load the team</h2>
      <p className="max-w-[64ch] text-body text-ink-soft">
        Something went wrong on our side. Please try again in a moment.
      </p>
    </Card>
  );
}
