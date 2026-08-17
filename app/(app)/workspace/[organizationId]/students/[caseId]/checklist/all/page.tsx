import { openCaseRoute } from "@/lib/cases/case-route";
import { CaseRouteOutage } from "@/components/workspace/case-route-outage";
import { ChecklistAllPanel } from "@/components/case-experience/checklist-landing-panel";

/**
 * The case's global document checklist — access-matrix cell 22, and the surface
 * whose toggle actually writes.
 *
 * Each tick posts to `POST /api/documents/status` naming THIS case, so the row
 * lands on the student's case with `owner IS NULL` (spec §6.3) rather than on the
 * counsellor's own checklist. `ds_insert_case` / `ds_update_case` decide it as the
 * authenticated user.
 *
 * No link on to the documents vault: that is Stage 4's, and its Storage object
 * paths are still owner-keyed.
 */
export default async function CaseChecklistAllPage({
  params,
}: {
  params: Promise<{ organizationId: string; caseId: string }>;
}) {
  const { organizationId, caseId } = await params;
  const gate = await openCaseRoute(organizationId, caseId, "/checklist/all");
  if (!gate.ok) return <CaseRouteOutage organizationId={organizationId} outage={gate.outage} />;

  return ChecklistAllPanel({ db: gate.supabase, caseId });
}
