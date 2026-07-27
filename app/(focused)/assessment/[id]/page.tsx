import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOwnedAssessment, getRecoverableAssessment } from "@/lib/assessments/repo";
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

  // Signed-in users read their own assessment under RLS. An anonymous visitor recovers
  // THIS assessment by its unguessable id — but only while it is unclaimed and unexpired
  // — via the server-only admin client (anon has no table grant; see getRecoverableAssessment).
  // The same client serves any legacy-shape catalogue recompute below, since the
  // catalogue is also closed to anon.
  const db: SupabaseClient<Database> = signedIn ? supabase : createSupabaseAdminClient();
  const row = signedIn
    ? await getOwnedAssessment(supabase, id)
    : await getRecoverableAssessment(db, id, new Date().toISOString());
  if (!row) notFound();

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
