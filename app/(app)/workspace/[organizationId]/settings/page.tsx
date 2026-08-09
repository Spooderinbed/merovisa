import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOrgPermission } from "@/lib/cases/require-org-permission";
import { listActorOrganizations } from "@/lib/org/repo";
import { Card } from "@/components/ui/card";
import { OrgSettingsForm } from "@/components/workspace/org-settings-form";

/**
 * Access-matrix cell 2 — organization settings. **Owner-only, not admin**
 * (canonical divergence #1). An admin reaching this URL gets `notFound()`, the
 * same non-answer `getOrgContext` gives, so the page is not an enumeration oracle
 * for organizations the actor may not administer.
 *
 * The current name and slug come from `listActorOrganizations` rather than a
 * direct `organizations` read, so the row shown is by construction one the actor
 * is an ACTIVE member of — an inactive owner sees nothing to edit here, which is
 * the same answer `actor_owner_org_ids()` gives the database.
 */

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/auth?next=/workspace/${organizationId}/settings`);

  const settings = await checkOrgPermission(data.user.id, organizationId, "org.settings", supabase);
  if (!settings.decision.allowed) notFound();

  const organizations = await listActorOrganizations(data.user.id, supabase);
  if (!organizations.ok) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">We couldn&apos;t load this organization</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            Something went wrong on our side. Please try again in a moment.
          </p>
        </Card>
      </div>
    );
  }
  const organization = organizations.data.find((org) => org.id === organizationId);
  if (!organization) notFound();

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <Link href="/workspace" className="text-meta text-primary underline underline-offset-4">
          ← All organizations
        </Link>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Organization settings</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Only the owner can change these. The web address is how links to this organization are
          built, so changing it breaks the old ones.
        </p>
      </header>

      <Card as="section" padding="lg">
        <OrgSettingsForm
          organizationId={organization.id}
          name={organization.name}
          slug={organization.slug}
        />
      </Card>
    </div>
  );
}
