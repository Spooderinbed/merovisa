import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOwnedAssessment } from "@/lib/assessments/repo";
import { Results } from "@/components/results/results";
import type { AssessmentPayload } from "@/lib/results/types";
import type { Destination } from "@/lib/scoring/types";

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/assess");

  const row = await getOwnedAssessment(supabase, id);
  if (!row) notFound();

  // result holds the full AssessmentPayload snapshot (see /api/assess).
  const payload = row.result as unknown as AssessmentPayload;
  return (
    <Results
      payload={payload}
      destination={row.destination_id as Destination}
      mode="owned"
    />
  );
}
