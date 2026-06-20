import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimAndBootstrapProfile } from "@/lib/assessments/claim";
import { safeNext } from "@/lib/auth/safe-next";
import { verifyClaim } from "@/lib/auth/hmac-claim";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const claimToken = url.searchParams.get("claim");
  const next = url.searchParams.get("next");
  const origin = url.origin;

  if (!code) return NextResponse.redirect(`${origin}/assess`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/assess?error=auth`);

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  const googleName = data.user?.user_metadata?.full_name as string | undefined;
  const email = data.user?.email ?? undefined;

  let claimedAssessmentId: string | null = null;
  if (claimToken) {
    const verified = verifyClaim(claimToken);
    if (!verified) {
      return NextResponse.redirect(`${origin}/assess?error=invalid-claim`);
    }
    claimedAssessmentId = verified.assessmentId;
  }

  if (claimedAssessmentId && userId) {
    const { claimed } = await claimAndBootstrapProfile(createSupabaseAdminClient(), {
      assessmentId: claimedAssessmentId, userId, googleName, email,
    });
    if (!claimed) return NextResponse.redirect(`${origin}/assess?error=expired`);
    return NextResponse.redirect(`${origin}/assessment/${claimedAssessmentId}`);
  }

  const fallback = safeNext(next) ?? "/dashboard";
  return NextResponse.redirect(`${origin}${fallback}`);
}
