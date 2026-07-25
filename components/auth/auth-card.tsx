"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmailSignIn } from "@/components/auth/email-sign-in";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface AuthCardProps {
  nextPath?: string;
  /** Signed claim token when the visitor arrived from an anonymous assessment. */
  claimToken?: string | null;
}

export function AuthCard({ nextPath, claimToken }: AuthCardProps) {
  const continueWithGoogle = async () => {
    const supabase = createSupabaseBrowserClient();
    const destination = nextPath ?? "/dashboard";
    const params = new URLSearchParams({ next: destination });
    if (claimToken) params.set("claim", claimToken);
    const redirectTo = `${window.location.origin}/auth/callback?${params.toString()}`;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  };

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col gap-7 px-5 pb-20 pt-16">
      <div className="flex animate-rise flex-col items-center gap-3 text-center">
        <span aria-hidden className="grid h-11 w-11 place-items-center rounded-md bg-primary text-on-primary">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 10 12 5 2 10l10 5 10-5Z" />
            <path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
          </svg>
        </span>
        <h1 className="text-[clamp(28px,3.4vw,38px)]">Save your result</h1>
        <p className="max-w-[42ch] text-lead text-ink-soft">
          We&apos;ll keep your verdict and checklist safe so you can pick up where you left off. No spam, no agents
          calling you.
        </p>
      </div>

      <Card padding="lg" className="flex animate-settle flex-col gap-3">
        <Button size="lg" onClick={continueWithGoogle} className="w-full">
          Continue with Google
        </Button>

        <p className="inline-flex items-center justify-center gap-2 text-small text-ink-faint">
          <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Your profile is private. We never sell your data.
        </p>

        {/* No Google account, or no wish to hand Google your study plans? The email
            path is on the same screen rather than behind a disclosure — for anyone
            who can't use the primary button, a hidden alternative is still a wall. */}
        <div className="mt-2 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          <span className="font-mono text-caption uppercase tracking-wide text-ink-faint">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <EmailSignIn claimToken={claimToken} nextPath={nextPath} />
      </Card>
    </div>
  );
}
