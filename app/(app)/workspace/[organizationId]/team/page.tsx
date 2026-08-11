import Link from "next/link";
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
 * Gated on `org.manage`, which the matrix gives to `owner` and `admin` and denies
 * to `counsellor`. A denial renders `notFound()` rather than a "forbidden" page:
 * telling an actor that an organization exists but is not theirs is an
 * enumeration oracle, and `getOrgContext` already refuses to distinguish "unknown
 * organization" from "not a member" for the same reason.
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
  if (!manage.decision.allowed) {
    if (manage.decision.reason === "lookup-failed") {
      return (
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
          <TeamLookupFailedCard />
        </div>
      );
    }
    notFound();
  }
  const settings = await checkOrgPermission(data.user.id, organizationId, "org.settings", supabase);
  const viewerIsOwner = settings.decision.allowed;

  // Computed HERE, on the server. `lib/cases/permissions` is `server-only` because
  // the permission matrix is server business logic that must never be readable in
  // client JS, so the row component receives the option list rather than importing
  // the module that defines it.
  const roleOptions = MEMBERSHIP_ROLES.filter((option) => viewerIsOwner || option !== "owner");

  const members = await listOrgMembers(organizationId, supabase);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <Link href="/workspace" className="text-meta text-primary underline underline-offset-4">
          ← All organizations
        </Link>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Team</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Change what someone can do, or switch off their access. Deactivating keeps their record —
          it does not delete their history.
        </p>
      </header>

      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h2 className="text-title font-medium">Adding people comes later</h2>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Invitations are not built yet. For now, new team members are added by MeroVisa — this page
          manages the people who are already here.
        </p>
      </Card>

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
