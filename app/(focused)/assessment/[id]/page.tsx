import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOwnedAssessment } from "@/lib/assessments/repo";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { assembleAssessment } from "@/lib/results/assemble";
import { hasLegacyMatchShape } from "@/lib/results/legacy";
import { Results } from "@/components/results/results";
import type { AssessmentPayload } from "@/lib/results/types";
import type { Destination, StudentProfile } from "@/lib/scoring/types";

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/assess");

  const row = await getOwnedAssessment(supabase, id);
  if (!row) notFound();

  // result holds the full AssessmentPayload snapshot (see /api/assess).
  let payload = row.result as unknown as AssessmentPayload;

  // Backcompat: assessments stored before MV-01 hold university-level matches the
  // current UI can't render. Recompute matches from the persisted profile snapshot
  // against the live catalogue, keeping the snapshot's original verdict/stamps.
  if (hasLegacyMatchShape(payload)) {
    const snapshot = row.profile_snapshot as unknown as StudentProfile | null;
    if (snapshot) {
      const [programs, universities] = await Promise.all([
        listAllPrograms(supabase),
        listAllUniversities(supabase),
      ]);
      const fresh = assembleAssessment(snapshot, programs, universities);
      payload = { ...payload, matches: fresh.matches, matchedCount: fresh.matchedCount, preferenceNote: fresh.preferenceNote };
    } else {
      payload = { ...payload, matches: [], matchedCount: 0 };
    }
  }
  return (
    <Results
      payload={payload}
      destination={row.destination_id as Destination}
      mode="owned"
    />
  );
}
