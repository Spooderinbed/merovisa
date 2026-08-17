import { openCaseRoute, caseRouteBase } from "@/lib/cases/case-route";
import { CaseRouteOutage } from "@/components/workspace/case-route-outage";
import { MatchesPanel } from "@/components/case-experience/matches-panel";

/**
 * The student's matches, worked by their counsellor — access-matrix cell 21.
 *
 * The shortlist control writes `user_program_state` through
 * `POST /api/shortlist`, which names this case (spec F-8). `checklistBase` keeps
 * each card's per-program checklist link inside the case.
 */
export default async function CaseMatchesPage({
  params,
}: {
  params: Promise<{ organizationId: string; caseId: string }>;
}) {
  const { organizationId, caseId } = await params;
  const gate = await openCaseRoute(organizationId, caseId, "/matches");
  if (!gate.ok) return <CaseRouteOutage organizationId={organizationId} outage={gate.outage} />;

  return MatchesPanel({
    db: gate.supabase,
    caseId,
    checklistBase: caseRouteBase(organizationId, caseId),
    header: (
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Matches</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Where this profile fits today.</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Strong / Possible / Reach against each program&apos;s published thresholds, computed from
          this student&apos;s profile — the same rules the student would see.
        </p>
      </header>
    ),
  });
}
