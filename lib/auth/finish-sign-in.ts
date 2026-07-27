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

  const { claimed } = await claimAndBootstrapProfile(createSupabaseAdminClient(), {
    assessmentId: verified.assessmentId,
    userId: user.id,
    googleName: user.user_metadata?.full_name ?? undefined,
    email: user.email ?? undefined,
  });
  if (!claimed) return "/assess?error=expired";
  return `/assessment/${verified.assessmentId}`;
}
