import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAssessmentById, getRecoverableAssessment } from "@/lib/assessments/repo";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { formatExpiryLabel } from "@/lib/assessments/expiry";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { assembleAssessment } from "@/lib/results/assemble";
import { normalizeStoredProfileCompleteness } from "@/lib/results/completeness";
import { scoringRulesStale } from "@/lib/data/scoring-freshness";
import { buildIntakeTimeline } from "@/lib/timing/intake";
import { hasLegacyMatchShape } from "@/lib/results/legacy";
import { Results } from "@/components/results/results";
import type { Database } from "@/lib/supabase/types";
import type { AssessmentPayload } from "@/lib/results/types";
import type { Destination, StudentProfile } from "@/lib/scoring/types";

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);

  // THIS PAGE IS DELIBERATELY TWO REGIMES, and the branch is explicit because two
  // regimes in one file is how "knowing the id grants access" survives a refactor
  // by accident (MV-157 §D, Risk 9):
  //
  //   CLAIMED row (case_id set) — case-authorized. Reading it is not enough; the
  //     actor must hold `case.read` on the row's OWN case, so knowing the id gets
  //     a stranger a 404. This is the half MV-151's registry flagged as "Stage 2
  //     must re-scope it".
  //
  //   UNCLAIMED, case-less row — id-as-credential SURVIVES, on purpose. Plan line
  //     354 ("knowing a case ID grants no access") governs CASES; a pre-claim
  //     anonymous assessment has no case, is unguessable, and MV-135's purge takes
  //     it in 3 days. Removing this would break anonymous refresh/back/tab-restore
  //     before sign-in (MV-28) — the single most motivated moment in the funnel.
  const db: SupabaseClient<Database> = signedIn ? supabase : createSupabaseAdminClient();
  const row = signedIn
    ? await getAssessmentById(supabase, id)
    : await getRecoverableAssessment(db, id, new Date().toISOString());
  if (!row) notFound();

  if (signedIn && row.case_id !== null) {
    const { decision } = await checkCasePermission(data.user!.id, row.case_id, "case.read", supabase);
    if (!decision.allowed) notFound();
  }

  // result holds the full AssessmentPayload snapshot (see /api/assess).
  let payload = row.result as unknown as AssessmentPayload;
  const snapshot = row.profile_snapshot as unknown as StudentProfile | null | undefined;

  // Stored rows from the old "profile accuracy" meter keep the same payload key but
  // carry stale Basic/Verified/Complete values. Rebuild only that legacy field from
  // the snapshot beside it; current payloads are returned unchanged.
  if (snapshot) {
    payload = {
      ...payload,
      accuracy: normalizeStoredProfileCompleteness(payload.accuracy, snapshot),
    };
  }

  // `rulesStale` is a fact about NOW, not about the stored assessment: a verdict
  // scored while every rule was current can age past a reverifyBy between visits.
  // Stored payloads replay verbatim, so trusting the captured flag would show the
  // calm "rules verified …" line over a verdict whose inputs are overdue — the
  // failure MV-132's FX deadline makes reachable, and the behaviour the dashboard
  // already implements (components/dashboard/snapshot-card.tsx). OR, not overwrite:
  // a verdict flagged stale when it was scored must never be un-flagged on re-read.
  payload = { ...payload, rulesStale: Boolean(payload.rulesStale) || scoringRulesStale() };

  // Backcompat: assessments stored before MV-01 hold university-level matches the
  // current UI can't render. Recompute matches from the persisted profile snapshot
  // against the live catalogue, keeping the snapshot's original verdict/stamps.
  if (hasLegacyMatchShape(payload)) {
    if (snapshot) {
      const [programs, universities] = await Promise.all([
        listAllPrograms(db),
        listAllUniversities(db),
      ]);
      const fresh = assembleAssessment(snapshot, programs, universities);
      payload = { ...payload, matches: fresh.matches, matchedCount: fresh.matchedCount, preferenceNote: fresh.preferenceNote };
    } else {
      payload = { ...payload, matches: [], matchedCount: 0 };
    }
  }
  // Compute the intake tick positions once on the server so the SSR markup and the
  // client hydration render identical left:% — the client never recomputes from its
  // own clock/timezone (MV-118 #11).
  const intakeTimeline = buildIntakeTimeline(payload.intake);
  return (
    <Results
      payload={payload}
      destination={row.destination_id as Destination}
      mode={signedIn ? "owned" : "anonymous"}
      assessmentId={signedIn ? null : id}
      // Derived server-side from the stored expires_at (created + 3d), so the day
      // reflects the assessment's real age and is identical server + client (MV-118 #4).
      expiryLabel={signedIn ? undefined : formatExpiryLabel(row.expires_at)}
      intakeTimeline={intakeTimeline}
    />
  );
}
