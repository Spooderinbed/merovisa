import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
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

  // MV-157: a signed-in visitor's interstitial is keyed on their case. No case (or
  // no `case.read` on it) means no primary to offer — fall through to the wizard,
  // which is the same branch a signed-in user with no assessment already takes.
  const caseId = await resolvePersonalCaseId(data.user.id, supabase);
  const allowed =
    caseId !== null &&
    (await checkCasePermission(data.user.id, caseId, "case.read", supabase)).decision.allowed;
  const primary = caseId === null || !allowed
    ? null
    : await getPrimaryAssessmentForCase(supabase, caseId);
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
