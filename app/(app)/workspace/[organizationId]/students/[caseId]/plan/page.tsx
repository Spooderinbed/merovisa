import { openCaseRoute } from "@/lib/cases/case-route";
import { CaseRouteOutage, CaseWorkspaceShell } from "@/components/workspace/case-workspace-shell";
import { PlanPanel } from "@/components/case-experience/plan-panel";

/**
 * The student's plan, worked by their counsellor.
 *
 * `POST /api/plan/action` is the one route Stage 3 retires from the service-role
 * registry (spec §6.2 entry 8), so every read and write on this page is decided
 * by `plan_items_select_case` / `plan_items_update_case` as the authenticated
 * user — and the action names THIS case rather than the counsellor's own.
 */
export default async function CasePlanPage({
  params,
}: {
  params: Promise<{ organizationId: string; caseId: string }>;
}) {
  const { organizationId, caseId } = await params;
  const gate = await openCaseRoute(organizationId, caseId, "/plan");
  if (!gate.ok) return <CaseRouteOutage organizationId={organizationId} outage={gate.outage} />;

  const panel = await PlanPanel({
    db: gate.supabase,
    caseId,
    header: (
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Plan</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">
          The shortest path to a stronger application.
        </h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Ranked by impact on this student&apos;s verdict and visa case. It regenerates whenever
          their profile changes.
        </p>
      </header>
    ),
  });

  return (
    <CaseWorkspaceShell
      organizationId={organizationId}
      caseId={caseId}
      caseRow={gate.caseRow}
      active="plan"
    >
      {panel}
    </CaseWorkspaceShell>
  );
}
