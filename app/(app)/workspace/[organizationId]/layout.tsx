import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listActorOrganizations } from "@/lib/org/repo";
import { Card } from "@/components/ui/card";
import { OrgRail } from "@/components/workspace/org-rail";

/**
 * The organization band and rail (spec §1) — the chrome for "you are inside THIS
 * consultancy", on every route under `/workspace/[organizationId]`.
 *
 * ## This layout is chrome, not the gate
 *
 * Every page below it authorizes independently, because a counsellor can be
 * reassigned while a layout stays mounted (spec §1, "Persistent case context"). The
 * `notFound()` here exists so the chrome cannot NAME an organization the actor has
 * no standing in — not to spare the pages a decision they still make.
 *
 * ## Why `listActorOrganizations` rather than `getOrgContext`
 *
 * The band needs three things: the organization's name, the actor's role in it, and
 * whether there is anywhere else to switch to. `getOrgContext` answers the second
 * only — it deliberately never reads the `organizations` row. One
 * `listActorOrganizations` call answers all three, already filtered to ACTIVE
 * memberships (an inactive member is not listed, so a revoked membership can never
 * be railed) and already double-locked: a membership whose organization did not come
 * back is dropped rather than rendered from its id.
 *
 * ## The two failures are different sentences
 *
 * A lookup that FAILED renders an outage and keeps the shell. "Not a member",
 * "unknown organization" and "revoked" all render `notFound()` — one answer, so the
 * page is not an enumeration oracle. Collapsing the first into the second would tell
 * an owner their organization does not exist because Supabase blipped, which is the
 * quiet dishonesty this product exists to avoid (MISTAKES.md: `lookup-failed` is
 * always an outage, never a permission denial).
 */
export default async function OrgWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/auth?next=/workspace/${organizationId}`);

  const result = await listActorOrganizations(data.user.id, supabase);
  if (!result.ok) return <OrgShellOutage />;

  const organization = result.data.find((org) => org.id === organizationId);
  if (organization === undefined) notFound();

  return (
    <>
      <OrgRail
        organizationId={organization.id}
        organizationName={organization.name}
        canManageSettings={organization.role === "owner"}
        // Only when there is somewhere else to go: a sole-organization actor
        // following this link would be bounced straight back by `/workspace`'s
        // auto-enter, so it would be a control that does nothing.
        canSwitchOrganization={result.data.length > 1}
      />
      {children}
    </>
  );
}

/**
 * The children are deliberately NOT rendered here. Every page below states facts
 * about one consultancy's students; rendering them inside a shell that could not
 * establish which consultancy it is would strip the one piece of context that makes
 * those facts safe to read.
 */
function OrgShellOutage() {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h1 className="text-title font-medium">We couldn&apos;t load this organization</h1>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Something went wrong on our side. This is not a statement about this organization or your
          access — please try again in a moment.
        </p>
      </Card>
    </div>
  );
}
