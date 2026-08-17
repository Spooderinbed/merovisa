import { openCaseRoute, caseRouteBase } from "@/lib/cases/case-route";
import { CaseRouteOutage } from "@/components/workspace/case-route-outage";
import { ChecklistLandingPanel } from "@/components/case-experience/checklist-landing-panel";

/**
 * The student's checklist landing — access-matrix cell 22's entry point.
 *
 * `base` keeps every link inside this case. `documentsHref` is null: the vault is
 * Stage 4's, its Storage object paths are still owner-keyed (Stage 2 spec §8),
 * and linking a counsellor to their OWN vault from a student's case would be
 * worse than offering no link at all.
 */
export default async function CaseChecklistPage({
  params,
}: {
  params: Promise<{ organizationId: string; caseId: string }>;
}) {
  const { organizationId, caseId } = await params;
  const gate = await openCaseRoute(organizationId, caseId, "/checklist");
  if (!gate.ok) return <CaseRouteOutage organizationId={organizationId} outage={gate.outage} />;

  return ChecklistLandingPanel({
    db: gate.supabase,
    caseId,
    base: caseRouteBase(organizationId, caseId),
    documentsHref: null,
  });
}
