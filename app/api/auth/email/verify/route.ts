import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, ipFromRequest } from "@/lib/rate-limit/upstash";
import { EmailVerifySchema } from "@/lib/validation/auth-email";
import { resolveSignInDestination } from "@/lib/auth/finish-sign-in";
import { MAX_OTP_ATTEMPTS, recordOtpAttempt, clearOtpAttempts } from "@/lib/auth/otp-attempts";

const BURNED = "Too many wrong tries. Send yourself a new code.";

/**
 * Step 2 of email sign-in: exchange the emailed code for a session.
 *
 * Verifying server-side sets the session cookies here and, crucially, keeps the
 * whole flow on one page — the student can read the code on their phone and type
 * it on a laptop. Landing is delegated to `resolveSignInDestination`, the same
 * mapping /auth/callback uses, so an email session claims and lands exactly as a
 * Google one does.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = ipFromRequest(request);
  if (!(await checkRateLimit("auth-email-verify", ip, 10, "1 m"))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = EmailVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the 6-digit code from your email" }, { status: 422 });
  }
  const { email, code, claim, next } = parsed.data;

  // Per-address guard. The IP limit above and GoTrue's own are both per-IP, which
  // a rotating pool defeats; this is what actually bounds guesses at a code.
  // Reserved before the guess is spent, not counted after: an atomic INCR is the
  // only thing that stops a concurrent burst from all passing one stale read.
  const attempt = await recordOtpAttempt(email);
  if (attempt > MAX_OTP_ATTEMPTS) {
    return NextResponse.json({ error: BURNED }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    return NextResponse.json(
      {
        error:
          attempt >= MAX_OTP_ATTEMPTS
            ? BURNED
            : "That code didn't work. Check it, or send a new one.",
      },
      { status: 401 },
    );
  }
  await clearOtpAttempts(email);

  const { data } = await supabase.auth.getUser();
  const redirectTo = await resolveSignInDestination(data.user, { claim, next });
  return NextResponse.json({ redirectTo });
}
