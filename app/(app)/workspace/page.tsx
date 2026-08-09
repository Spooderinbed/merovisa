import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listActorOrganizations } from "@/lib/org/repo";
import { Card } from "@/components/ui/card";

/**
 * Access-matrix cell 1 — organization selection.
 *
 * This is a selection surface even for a single-organization actor: MV-170's case
 * list is scoped by the chosen organization, so the id has to come from somewhere
 * explicit rather than being inferred from "the only one you have" and then
 * quietly breaking the day a second membership appears.
 *
 * There is no "create an organization" control, and its absence is deliberate:
 * spec F-2 records that `authenticated` holds no INSERT grant on `organizations`
 * and no INSERT policy exists. Provisioning is a founder/ops action. A button here
 * would 42501 and be a lie about what the product can do.
 */

export default async function WorkspacePage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth?next=/workspace");

  const result = await listActorOrganizations(data.user.id, supabase);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Workspace</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Choose an organization</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          You are working inside one consultancy at a time. Everything you see next — students,
          cases, team — belongs to the organization you pick here.
        </p>
      </header>

      {!result.ok ? (
        // "The lookup failed" and "you belong to nothing" must never render the
        // same: the second is a claim about the actor, and making it falsely is
        // the kind of quiet dishonesty this product exists to avoid.
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">We couldn&apos;t load your organizations</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            Something went wrong on our side. This is not a statement about your access — please
            try again in a moment.
          </p>
        </Card>
      ) : result.data.length === 0 ? (
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">You are not part of any organization yet</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            Consultancy workspaces are set up by MeroVisa. Once someone adds you to one, it will
            appear here.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {result.data.map((org) => (
            <li key={org.id}>
              <Card as="article" padding="lg" className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-title font-medium">{org.name}</h2>
                  <p className="text-meta text-ink-soft">
                    <span className="font-mono">{org.slug}</span> · you are {roleLabel(org.role)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {org.role === "owner" || org.role === "admin" ? (
                    <Link
                      href={`/workspace/${org.id}/team`}
                      className="text-control text-primary underline underline-offset-4"
                    >
                      Team
                    </Link>
                  ) : null}
                  {org.role === "owner" ? (
                    <Link
                      href={`/workspace/${org.id}/settings`}
                      className="text-control text-primary underline underline-offset-4"
                    >
                      Organization settings
                    </Link>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function roleLabel(role: string): string {
  if (role === "owner") return "the owner";
  if (role === "admin") return "an admin";
  return "a counsellor";
}
