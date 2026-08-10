import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { AssessFlow } from "@/components/assess/assess-flow";
import { AssessInterstitial } from "@/components/assess/assess-interstitial";
import { ClaimFailure } from "@/components/assess/claim-failure";
import { isClaimErrorCode } from "@/lib/auth/claim-error";
import { first } from "@/lib/http/search-params";

export default async function AssessPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string | string[]; error?: string | string[] }>;
}) {
  const sp = await searchParams;
  // Same collapse as /auth (MV-176). Nothing here calls a string method on a
  // search param, so a repeated one never crashed this page — it was silently
  // ignored instead, because an array is neither `"1"` nor a known error code.
  // Honouring the first value is what the URL actually asked for.
  const fresh = first(sp.new) === "1";
  const error = first(sp.error);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  // A claim/OAuth failure returns the student here with `?error=` (audit C-9). Render an
  // honest, recoverable state before the normal fork, so the most motivated user in the
  // funnel gets a path forward instead of a silent `?new`-only wizard. An unrecognised
  // code is ignored — recovery is tailored to whether they ended up signed in.
  if (isClaimErrorCode(error)) {
    return <ClaimFailure reason={error} signedIn={Boolean(data.user)} />;
  }

  if (!data.user) return <AssessFlow fresh={fresh} />;

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
  if (!primary || fresh) return <AssessFlow signedIn fresh={fresh} />;

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
