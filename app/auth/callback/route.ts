import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveSignInDestination } from "@/lib/auth/finish-sign-in";
import { resolveSiteOrigin } from "@/lib/auth/site-origin";

/**
 * Email links arrive as a `token_hash` plus a type. Only these are ours to verify —
 * an unrecognised `?type=` is refused rather than forwarded to Supabase. `invite`
 * is here so a future invitation link lands on this same claim/bootstrap path.
 */
const EMAIL_OTP_TYPES = ["email", "magiclink", "signup", "recovery", "invite", "email_change"] as const;

function emailOtpType(raw: string | null): EmailOtpType | null {
  if (!raw) return "email";
  return (EMAIL_OTP_TYPES as readonly string[]).includes(raw) ? (raw as EmailOtpType) : null;
}

/**
 * The one landing pad for every sign-in method.
 *
 * Google OAuth returns a `code` to exchange; the emailed sign-in link returns a
 * `token_hash` to verify. Both then hand off to `resolveSignInDestination`, so
 * claiming, profile bootstrap, and the final landing page are identical whichever
 * way the student signed in.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const claim = url.searchParams.get("claim");
  const next = url.searchParams.get("next");
  const origin = resolveSiteOrigin(request, url);

  if (!code && !tokenHash) return NextResponse.redirect(`${origin}/assess`);

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/assess?error=auth`);
  } else {
    const type = emailOtpType(url.searchParams.get("type"));
    if (!type) return NextResponse.redirect(`${origin}/assess?error=auth`);
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash!, type });
    if (error) return NextResponse.redirect(`${origin}/assess?error=auth`);
  }

  const { data } = await supabase.auth.getUser();
  const destination = await resolveSignInDestination(data.user, { claim, next });
  return NextResponse.redirect(`${origin}${destination}`);
}
