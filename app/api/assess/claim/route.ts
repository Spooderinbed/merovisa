import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimAndBootstrapProfile } from "@/lib/assessments/claim";
import { checkRateLimit, ipFromRequest } from "@/lib/rate-limit/upstash";

/**
 * Re-claim an anonymous assessment for the CURRENT signed-in user (MV-130 / audit C-9).
 *
 * The claim normally runs once, on the sign-in redirect (see resolveSignInDestination).
 * When that leg fails transiently, or the user landed in a fresh account without the
 * claim token binding (invalid/tampered token), the assessment is still sitting
 * unclaimed in the DB while the student is already authenticated — the one state the
 * OAuth redirect can no longer recover, because there is no second code to exchange.
 * The `/assess` recovery surface calls this with the id it preserved in sessionStorage
 * so the student can finish binding their work in place, reusing the exact same
 * `claimAndBootstrapProfile` the sign-in seam uses (no second claim mechanism).
 *
 * `claimAssessment` only ever binds an UNCLAIMED, UNEXPIRED row, so an authenticated
 * caller cannot steal another account's assessment — the id is an unguessable UUID and
 * the predicate is the gate, exactly as in the anonymous-recovery read (MV-28).
 */
const ClaimSchema = z.object({ assessmentId: z.string().uuid() });

export async function POST(request: Request): Promise<Response> {
  const ip = ipFromRequest(request);
  if (!(await checkRateLimit("assess-claim", ip, 10, "1 m"))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Recovery is only meaningful once authenticated: an anonymous visitor recovers by
  // re-running sign-in, not this endpoint.
  if (!user) return NextResponse.json({ error: "not-signed-in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-id" }, { status: 422 });
  }
  const { assessmentId } = parsed.data;

  const { claimed, reason } = await claimAndBootstrapProfile(createSupabaseAdminClient(), {
    assessmentId,
    userId: user.id,
    googleName: user.user_metadata?.full_name ?? undefined,
    email: user.email ?? undefined,
  });

  // `already-mine` is a success from the student's chair — they own the row, so send
  // them to it rather than reporting a failure on a retry that actually worked.
  if (claimed || reason === "already-mine") {
    return NextResponse.json({ ok: true, redirectTo: `/assessment/${assessmentId}` });
  }

  // Honest, distinct outcomes so the surface can keep explaining rather than loop a
  // retry that can't succeed. 503 marks the one retryable case.
  const status = reason === "error" ? 503 : reason === "claimed" ? 409 : 410;
  return NextResponse.json({ ok: false, reason: reason ?? "expired" }, { status });
}
