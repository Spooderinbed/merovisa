import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listActorOrganizations } from "@/lib/org/repo";
import { Card } from "@/components/ui/card";

/**
 * Access-matrix cell 1 — organization selection, and since MV-180 the ORGANIZATION
 * SWITCHER rather than the front door.
 *
 * A sole-organization actor is sent straight to their Day view. The id is still
 * explicit everywhere downstream — it is in the URL after the redirect, and every
 * page re-authorizes against it — so nothing is inferred from "the only one you
 * have" beyond which URL to open. The chooser is unchanged for an actor who
 * genuinely has more than one membership, and the day a second one appears they get
 * it back automatically.
 *
 * The auto-enter is deliberately conditioned on `ok && length === 1`. A failed
 * lookup must not be resolved by guessing an organization, and it is not "you have
 * exactly none" either — the two render as different sentences below, which is the
 * whole reason this page has an outage state.
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
  if (result.ok && result.data.length === 1) redirect(`/workspace/${result.data[0]!.id}`);

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
                  {/*
                    Every staff role holds `case.list` (cell 7) — a counsellor's
                    queue is narrower, not absent — so both links are
                    unconditional. The Day view is the landing (MV-179); the
                    directory survives beside it as All cases.
                  */}
                  <Link
                    href={`/workspace/${org.id}`}
                    className="text-control text-primary underline underline-offset-4"
                  >
                    Day view
                  </Link>
                  <Link
                    href={`/workspace/${org.id}/students`}
                    className="text-control text-primary underline underline-offset-4"
                  >
                    All cases
                  </Link>
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
