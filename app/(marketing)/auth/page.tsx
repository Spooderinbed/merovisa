import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthCard } from "@/components/auth/auth-card";
import { safeNext } from "@/lib/auth/safe-next";
import { CLAIM_TTL_MS, signClaim } from "@/lib/auth/hmac-claim";
import { first } from "@/lib/http/search-params";

/**
 * Sign the claim for a visitor who arrived here from their anonymous results.
 *
 * The Google buttons on the results page fetch this token over the wire before
 * redirecting; a plain link to /auth can't, so the page signs it server-side
 * instead. Same guard as /api/results/sign-claim — shape-check only; the claim
 * itself is what binds the row, and it only lands on an unclaimed, unexpired one.
 */
function claimFor(assessmentId: string | undefined): string | null {
  if (!assessmentId || !/^[0-9a-f-]{36}$/.test(assessmentId)) return null;
  try {
    return signClaim(assessmentId, Date.now() + CLAIM_TTL_MS);
  } catch (e) {
    // Mirrors startClaimOAuth: if signing is misconfigured, sign-in still works —
    // the student just claims later rather than being locked out of the page.
    console.error("[auth-page] claim signing failed:", e);
    return null;
  }
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; assessment?: string | string[] }>;
}) {
  const sp = await searchParams;
  // A repeated parameter arrives as `string[]` (MV-176). Collapsed here, once:
  // `safeNext` and `claimFor` both reason about a single value, and `AuthCard`
  // takes a `string`. Declaring `string` didn't make it one — `?next=/a&next=/b`
  // reached `safeNext`, which called `.startsWith` on an array and 500'd the
  // sign-in page.
  const next = first(sp.next);
  const assessment = first(sp.assessment);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    redirect(safeNext(next) ?? "/dashboard");
  }
  return <AuthCard nextPath={next} claimToken={claimFor(assessment)} />;
}
