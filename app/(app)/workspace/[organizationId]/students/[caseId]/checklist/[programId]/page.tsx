import { notFound } from "next/navigation";
import { openCaseRoute } from "@/lib/cases/case-route";
import { CaseRouteOutage, CaseWorkspaceShell } from "@/components/workspace/case-workspace-shell";
import { ChecklistProgramPanel } from "@/components/case-experience/checklist-landing-panel";

/**
 * One program's checklist for this case. Reached from the case's checklist
 * landing and from each matches card — both of which prefix their links with the
 * case base, so a counsellor never steps sideways into their own checklist.
 */
export default async function CaseProgramChecklistPage({
  params,
}: {
  params: Promise<{ organizationId: string; caseId: string; programId: string }>;
}) {
  const { organizationId, caseId, programId } = await params;
  const gate = await openCaseRoute(organizationId, caseId, `/checklist/${programId}`);
  if (!gate.ok) return <CaseRouteOutage organizationId={organizationId} outage={gate.outage} />;

  const panel = await ChecklistProgramPanel({ db: gate.supabase, caseId, programId });
  // An unknown program is a 404 about the PROGRAM, and it is decided here rather
  // than in the panel — a panel must not choose a route's status code.
  if (panel === null) notFound();

  return (
    <CaseWorkspaceShell
      organizationId={organizationId}
      caseId={caseId}
      caseRow={gate.caseRow}
      active="checklist"
    >
      {panel}
    </CaseWorkspaceShell>
  );
}
