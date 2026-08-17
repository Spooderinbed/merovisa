import Link from "next/link";
import { Card } from "@/components/ui/card";
import { openCaseRoute, caseRouteBase } from "@/lib/cases/case-route";
import { CaseRouteOutage, CaseWorkspaceShell } from "@/components/workspace/case-workspace-shell";

/**
 * The case route's front door — access-matrix cell 13.
 *
 * A counsellor opens a student's case and chooses a surface. It carries no data
 * of its own beyond what the shell already reads, so it is the cheapest page to
 * land on and the only one that has to explain what this place is.
 *
 * `/manage` (MV-171) stays where it is and is linked from here: assignment and
 * operational status are cells 9 and 10, answer to different claims, and belong
 * to the admin surface rather than to the student's record.
 */
export default async function CaseHomePage({
  params,
}: {
  params: Promise<{ organizationId: string; caseId: string }>;
}) {
  const { organizationId, caseId } = await params;
  const gate = await openCaseRoute(organizationId, caseId);
  if (!gate.ok) return <CaseRouteOutage organizationId={organizationId} outage={gate.outage} />;

  const base = caseRouteBase(organizationId, caseId);
  return (
    <CaseWorkspaceShell
      organizationId={organizationId}
      caseId={caseId}
      caseRow={gate.caseRow}
      active={null}
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 py-10">
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">This student&apos;s record</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            Everything you open here belongs to this student&apos;s case, and everything you change
            is saved to it. It is the same profile, matches, plan and checklist the student would
            see if they had an account.
          </p>
        </Card>
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">Not here yet</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            Documents are not part of the workspace yet. Assignment and status live on{" "}
            <Link href={`${base}/manage`} className="text-primary underline underline-offset-4">
              manage
            </Link>
            .
          </p>
        </Card>
      </div>
    </CaseWorkspaceShell>
  );
}
