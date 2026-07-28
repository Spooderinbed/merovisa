import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimAndBootstrapProfile } from "@/lib/assessments/claim";
import { safeNext } from "./safe-next";
import { verifyClaim } from "./hmac-claim";

/** The shape of `supabase.auth.getUser()`'s user that this path actually reads. */
export interface SignedInUser {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: string | null } | null;
}

export interface SignInParams {
  /** The signed claim token an anonymous visitor carried into sign-in. */
  claim?: string | null;
  /** A relative post-sign-in path, used only when there is nothing to claim. */
  next?: string | null;
}

/**
 * The single post-authentication mapping: given a freshly authenticated user and
 * whatever they carried into sign-in, bind their anonymous assessment (if any)
 * and decide where they land. Returns a relative path.
 *
 * Every sign-in method converges here — Google OAuth, the emailed 6-digit code,
 * and the emailed link all call this — so an email session can never drift from
 * a Google one on claiming, profile bootstrap, or landing page. Forking this is
 * how the anonymous-recovery contract silently breaks for one provider.
 */
export async function resolveSignInDestination(
  user: SignedInUser | null | undefined,
  params: SignInParams,
): Promise<string> {
  const fallback = safeNext(params.next) ?? "/dashboard";

  if (!params.claim) return fallback;

  const verified = verifyClaim(params.claim);
  if (!verified) return "/assess?error=invalid-claim";
  if (!user?.id) return fallback;

  const { claimed, reason } = await claimAndBootstrapProfile(createSupabaseAdminClient(), {
    assessmentId: verified.assessmentId,
    userId: user.id,
    googleName: user.user_metadata?.full_name ?? undefined,
    email: user.email ?? undefined,
  });
  if (claimed) return `/assessment/${verified.assessmentId}`;

  // A failed claim is not one dead end — route each cause to its own honest
  // recovery on /assess (MV-130 / audit C-9). `already-mine` is a re-claim, so it
  // is a success: land the student on the assessment they already own instead of a
  // false "expired". A bare `{ claimed: false }` (no reason) stays `expired`.
  switch (reason) {
    case "already-mine":
      return `/assessment/${verified.assessmentId}`;
    case "claimed":
      return "/assess?error=claimed";
    case "error":
      return "/assess?error=claim-failed";
    case "expired":
    default:
      return "/assess?error=expired";
  }
}
