import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Starts Google OAuth for an anonymous assessment, carrying a signed claim token
 * so the assessment is bound to the new account on callback.
 *
 * Shared by every anonymous-results entry point — the bottom ConversionPaths
 * card, the compact verdict-area prompt, and the University matches unlock gate —
 * so the sign-claim → signInWithOAuth flow lives in exactly one place.
 *
 * Browser-only: it touches `window` and the Supabase browser client. Never import
 * the server-only `hmac-claim` signer here — the token is fetched over the wire.
 */
export async function startClaimOAuth(assessmentId: string | null): Promise<void> {
  if (!assessmentId) return;

  // Fetch a signed claim token before redirecting to OAuth.
  let claimToken: string | null = null;
  try {
    const res = await fetch("/api/results/sign-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId }),
    });
    if (res.ok) {
      const data = (await res.json()) as { token?: string };
      claimToken = data.token ?? null;
    }
  } catch {
    // If signing fails, proceed without claim — the user can claim later.
  }

  const supabase = createSupabaseBrowserClient();
  const params = claimToken ? `?claim=${encodeURIComponent(claimToken)}` : "";
  const redirectTo = `${window.location.origin}/auth/callback${params}`;
  await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
}
