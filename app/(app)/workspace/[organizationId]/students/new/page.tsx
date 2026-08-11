import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOrgPermission } from "@/lib/cases/require-org-permission";
import { CaseCreateForm } from "@/components/workspace/case-create-form";
import { Card } from "@/components/ui/card";

/**
 * Access-matrix cell 8 — create a case for a student who has no account.
 *
 * **F-1, decided by the founder on 2026-08-10: owner/admin only.** `case.create`
 * is `deny` for a counsellor in `CASE_PERMISSION_MATRIX`, and `cases_insert_admin`
 * requires `actor_admin_org_ids()`. This page widens neither; it is the surface in
 * front of a decision both layers already make.
 *
 * A denial renders `notFound()` rather than a "forbidden" page, for the reason the
 * team page states: confirming an organization exists but is not yours is an
 * enumeration oracle. A FAILED CHECK is a different thing and renders an outage —
 * "we could not tell" is not "you may not", and telling someone they lack
 * permission because a query timed out sends them to ask a colleague instead of
 * retrying.
 */
export default async function NewStudentPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/auth?next=/workspace/${organizationId}/students/new`);

  const create = await checkOrgPermission(data.user.id, organizationId, "case.create", supabase);
  if (!create.decision.allowed) {
    if (create.decision.reason === "lookup-failed") {
      return <CheckFailed organizationId={organizationId} />;
    }
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href={`/workspace/${organizationId}/students`}
          className="text-meta text-primary underline underline-offset-4"
        >
          ← Students
        </Link>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Add a student</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          This creates the student&apos;s record so your team can work on it. They will have no
          account yet, and nothing is sent to them — inviting a student to sign in comes later.
        </p>
      </header>

      <Card as="section" padding="lg">
        <CaseCreateForm organizationId={organizationId} />
      </Card>
    </div>
  );
}

/** The outage state. Deliberately not `notFound()` — see the header. */
function CheckFailed({ organizationId }: { organizationId: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-8 px-5 py-10">
      <Link
        href={`/workspace/${organizationId}/students`}
        className="text-meta text-primary underline underline-offset-4"
      >
        ← Students
      </Link>
      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h1 className="text-title font-medium">We couldn&apos;t check your access</h1>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Something went wrong on our side. This is not a statement about your permissions — please
          try again in a moment.
        </p>
      </Card>
    </div>
  );
}
