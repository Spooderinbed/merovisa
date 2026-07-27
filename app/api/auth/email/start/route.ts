import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, ipFromRequest } from "@/lib/rate-limit/upstash";
import { EmailStartSchema } from "@/lib/validation/auth-email";
import { resolveSiteOrigin } from "@/lib/auth/site-origin";
import { safeNext } from "@/lib/auth/safe-next";
import { clearOtpAttempts } from "@/lib/auth/otp-attempts";

/**
 * Step 1 of email sign-in: ask Supabase Auth to email a 6-digit code (and a
 * sign-in link) to the address.
 *
 * `shouldCreateUser` is on because for a student with no Google account this IS
 * account creation — the same request both signs up and signs in. Whatever the
 * visitor carried in (their signed assessment claim, a next path) is folded into
 * the emailed link so clicking it lands on the same claim/bootstrap path the
 * typed code takes.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = ipFromRequest(request);
  if (!(await checkRateLimit("auth-email-start", ip, 5, "1 m"))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = EmailStartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 422 });
  }
  const { email, claim, next } = parsed.data;

  // Also limit per address, so a flood from rotating IPs can't bury one inbox.
  if (!(await checkRateLimit("auth-email-start-address", email, 5, "1 h"))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const params = new URLSearchParams({ next: safeNext(next) ?? "/dashboard" });
  if (claim) params.set("claim", claim);
  const emailRedirectTo = `${resolveSiteOrigin(request)}/auth/callback?${params.toString()}`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo, shouldCreateUser: true },
  });

  if (error) {
    console.error("[auth-email] send failed", { message: error.message });
    return NextResponse.json(
      { error: "We couldn't send your code just now. Try again in a minute." },
      { status: 502 },
    );
  }

  // A new code starts clean. Without this, guesses against the previous code would
  // burn this one on arrival and the brute-force guard would become a lockout.
  await clearOtpAttempts(email);

  return NextResponse.json({ ok: true });
}
