"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AuthCard() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const continueWithGoogle = async () => {
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard")}`;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice("Email sign-in is coming soon. For now please use Google.");
  };

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col gap-7 px-5 pb-20 pt-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden className="grid h-11 w-11 place-items-center rounded-md bg-primary text-on-primary">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 10 12 5 2 10l10 5 10-5Z" />
            <path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
          </svg>
        </span>
        <h1 className="text-[clamp(28px,3.4vw,38px)]">Save your result</h1>
        <p className="max-w-[42ch] text-[17px] text-ink-soft">
          We&apos;ll keep your verdict and checklist safe so you can pick up where you left off. No spam, no agents
          calling you.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
        <Button size="lg" onClick={continueWithGoogle} className="w-full">
          Continue with Google
        </Button>

        <p className="inline-flex items-center justify-center gap-2 text-[12.5px] text-ink-faint">
          <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Your profile is private. We never sell your data.
        </p>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 text-center font-mono text-[12.5px] uppercase tracking-wide text-ink-faint hover:text-ink"
        >
          {open ? "Hide other options" : "Other ways to sign in →"}
        </button>

        {open ? (
          <form onSubmit={submitEmail} className="mt-2 flex flex-col gap-3 border-t border-line pt-4">
            <label htmlFor="auth-email" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary"
            />
            <Button type="submit" variant="ghost" className="w-full">
              Create account & save
            </Button>
            {notice ? (
              <p role="status" className="text-[14px] text-ink-soft">
                {notice}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
