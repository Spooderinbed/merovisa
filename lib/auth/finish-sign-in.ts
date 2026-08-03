import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimAndBootstrapProfile } from "@/lib/assessments/claim";
import { ensurePersonalCase } from "@/lib/cases/personal-case";
import { safeNext } from "./safe-next";
import { verifyClaim } from "./hmac-claim";

/**
 * The shape of `supabase.auth.getUser()`'s user that this path actually reads.
 *
 * `name` joins `full_name` because `ensurePersonalCase` derives `display_name`
 * from both (MV-158 §A) and this is the verified session object it is handed —
 * there is no separate identity parameter anywhere on the path.
 */
export interface SignedInUser {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: string | null; name?: string | null } | null;
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

  if (!params.claim) {
    // GO-FORWARD PERSONAL-CASE CREATION (MV-157 §A). MV-155's migration
    // backfilled cases for owners that existed AT migration time; a user who
    // signs up afterwards needs one too, and this is the seam every provider
    // converges on. Idempotent, so an existing user pays one indexed read.
    //
    // It needs the ADMIN client: `cases_insert_admin` is the only INSERT policy
    // on `cases` and its WITH CHECK requires `organization_id IS NOT NULL`, so a
    // student cannot create their own (organization-less) personal case through
    // the authenticated client — it is refused 42501. This module is already a
    // registered `sanctioned` service-role exception for account linking, so no
    // new call site is introduced.
    //
    // Best-effort: a failure here must never block a successful sign-in. The
    // student lands on a dashboard with no case-scoped rows, which is what a
    // brand-new account looks like anyway, and the next sign-in retries.
    if (user?.id) {
      const caseId = await ensurePersonalCase(user, createSupabaseAdminClient());
      if (caseId === null) {
        console.error("[finish-sign-in] personal case creation failed", { userId: user.id });
      }
    }
    return fallback;
  }

  const verified = verifyClaim(params.claim);
  if (!verified) return "/assess?error=invalid-claim";
  if (!user?.id) return fallback;

  // MV-158: the verified session object goes in whole. There is no `googleName`
  // and no `email` parameter any more — identity is derived inside, so all four
  // entry points (Google OAuth, the emailed 6-digit code, the emailed link, and
  // the recover-in-place endpoint) produce byte-identical results from the same
  // available data. `claimAndBootstrapProfile` create-or-resolves the personal
  // case itself, before it touches the row.
  const { claimed, reason } = await claimAndBootstrapProfile(createSupabaseAdminClient(), {
    assessmentId: verified.assessmentId,
    user,
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
