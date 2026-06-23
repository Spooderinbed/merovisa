import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { AssessFlow } from "@/components/assess/assess-flow";
import { AssessInterstitial } from "@/components/assess/assess-interstitial";

export default async function AssessPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) return <AssessFlow fresh={sp.new === "1"} />;

  const primary = await getPrimaryAssessmentForUser(supabase, data.user.id);
  if (!primary || sp.new === "1") return <AssessFlow signedIn fresh={sp.new === "1"} />;

  return (
    <AssessInterstitial
      primary={{
        id: primary.id,
        destination_id: primary.destination_id,
        created_at: primary.created_at,
      }}
    />
  );
}
