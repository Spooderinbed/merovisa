import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveSignInDestination } from "@/lib/auth/finish-sign-in";
import { resolveSiteOrigin } from "@/lib/auth/site-origin";

/**
 * The one landing pad for every sign-in method.
 *
 * Google OAuth returns a `code` to exchange; email sign-in verifies its 6-digit
 * code at /api/auth/email/verify. Both hand off to `resolveSignInDestination`, so
 * claiming, profile bootstrap, and the final landing page are identical whichever
 * way the student signed in.
 *
 * This route deliberately does NOT accept an emailed `token_hash`. GoTrue derives
 * it as an unsalted sha224(email + otp) (crypto.GenerateTokenHash), so for a known
 * address it has exactly as many preimages as the 6-digit code — 1,000,000 — while
 * an unauthenticated GET here carries no address to count guesses against. That
 * made it an unmetered verification oracle that sidestepped the per-address cap in
 * lib/auth/otp-attempts. Typing the code is the only email path, and it is counted.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const claim = url.searchParams.get("claim");
  const next = url.searchParams.get("next");
  const origin = resolveSiteOrigin(request, url);

  if (!code) return NextResponse.redirect(`${origin}/assess`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/assess?error=auth`);

  const { data } = await supabase.auth.getUser();
  const destination = await resolveSignInDestination(data.user, { claim, next });
  return NextResponse.redirect(`${origin}${destination}`);
}
