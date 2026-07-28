import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { AssessFlow } from "@/components/assess/assess-flow";
import { AssessInterstitial } from "@/components/assess/assess-interstitial";
import { ClaimFailure } from "@/components/assess/claim-failure";
import { isClaimErrorCode } from "@/lib/auth/claim-error";

export default async function AssessPage({ searchParams }: { searchParams: Promise<{ new?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  // A claim/OAuth failure returns the student here with `?error=` (audit C-9). Render an
  // honest, recoverable state before the normal fork, so the most motivated user in the
  // funnel gets a path forward instead of a silent `?new`-only wizard. An unrecognised
  // code is ignored — recovery is tailored to whether they ended up signed in.
  if (isClaimErrorCode(sp.error)) {
    return <ClaimFailure reason={sp.error} signedIn={Boolean(data.user)} />;
  }

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
