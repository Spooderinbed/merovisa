import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimAndBootstrapProfile } from "@/lib/assessments/claim";
import { safeNext } from "@/lib/auth/safe-next";
import { verifyClaim } from "@/lib/auth/hmac-claim";

/**
 * Resolve the public site origin for post-auth redirects.
 *
 * Behind Vercel's load balancer, `new URL(request.url).origin` is the function's INTERNAL
 * host (localhost), so trusting it bounces production sign-ins to localhost. Precedence:
 *   1. NEXT_PUBLIC_SITE_URL — explicit, deterministic (set this in Vercel → can't be wrong)
 *   2. x-forwarded-host / host header — the proxy's public host
 *   3. url.origin — local dev (NODE_ENV=development) or no proxy headers
 */
function resolveSiteOrigin(request: Request, url: URL): string {
  if (process.env.NODE_ENV === "development") return url.origin;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return url.origin;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const claimToken = url.searchParams.get("claim");
  const next = url.searchParams.get("next");
  const origin = resolveSiteOrigin(request, url);

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
