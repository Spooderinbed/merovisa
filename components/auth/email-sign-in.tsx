"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EmailSignInProps {
  /** Signed claim token for an anonymous assessment, carried through both steps. */
  claimToken?: string | null;
  /** Relative landing path when there is nothing to claim. */
  nextPath?: string | null;
  /**
   * MV-194 — sign in WITHOUT navigating, for a caller whose current URL must not be left
   * and must not be handed to the auth flow.
   *
   * The invitation page is the one such caller: its URL *is* the credential
   * (`/invite/<token>`), so passing it as `nextPath` would put a live bearer token in the
   * body of `/api/auth/email/start`, in the `emailRedirectTo` that goes to GoTrue, and in
   * the redirect that comes back. Given this callback, the component signs the student in
   * and hands control back so the caller can `router.refresh()` in place — the token never
   * moves, and there is no round trip for it to be lost in.
   *
   * Nothing else passes it, and when it is absent the behaviour is byte-for-byte what it
   * was: `router.replace(redirectTo)`.
   */
  onSignedIn?: () => void;
}

async function postJson(path: string, body: Record<string, unknown>) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
  return { ok: res.ok, data };
}

/**
 * Email sign-in for students without a Google account — a 6-digit code rather
 * than a password, so there is nothing to store, leak, or reset. Signing in and
 * signing up are the same action, and so is recovery: whoever can read the inbox
 * gets back in.
 *
 * The code is typed here rather than followed from a link on purpose. Mail apps
 * open links in their own in-app browser, which loses the PKCE verifier and dead-
 * ends the sign-in; a typed code lets the student read it on a phone and finish
 * on a laptop. The email carries no link at all — see supabase/templates/ for why
 * a magic link turned out to be no stronger than the code, and unmeterable.
 */
export function EmailSignIn({ claimToken, nextPath, onSignedIn }: EmailSignInProps) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const context = {
    ...(claimToken ? { claim: claimToken } : {}),
    ...(nextPath ? { next: nextPath } : {}),
  };

  const requestCode = async (resend = false) => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const { ok, data } = await postJson("/api/auth/email/start", { email, ...context });
      if (!ok) {
        setError(data.error ?? "We couldn't send your code just now. Try again in a minute.");
        return;
      }
      setStep("code");
      if (resend) setNotice("New code sent.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    void requestCode();
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const { ok, data } = await postJson("/api/auth/email/verify", { email, code, ...context });
      if (!ok || !data.redirectTo) {
        setError(data.error ?? "That code didn't work. Check it, or send a new one.");
        return;
      }
      if (onSignedIn) {
        // Stay where we are. `redirectTo` is deliberately DISCARDED rather than followed —
        // see `onSignedIn`. The caller re-renders the current route, which now has a
        // session.
        onSignedIn();
        return;
      }
      router.replace(data.redirectTo);
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {step === "email" ? (
        <form onSubmit={submitEmail} className="flex flex-col gap-2">
          <label htmlFor="auth-email" className="text-meta text-ink-soft">
            Email address
          </label>
          <Input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Button type="submit" variant="ghost" loading={pending} loadingLabel="Sending" className="w-full">
            Send me a code
          </Button>
          <p className="text-meta text-ink-faint">
            We&apos;ll email you a 6-digit code. No password to create — or forget.
          </p>
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-2">
          <p role="status" className="text-meta text-ink-soft">
            We sent a 6-digit code to {email}. It expires in 10 minutes.
          </p>
          <label htmlFor="auth-code" className="text-meta text-ink-soft">
            6-digit code
          </label>
          <Input
            id="auth-code"
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="font-mono tracking-[0.3em]"
          />
          <Button type="submit" loading={pending} loadingLabel="Signing in" className="w-full">
            Sign in
          </Button>
          {notice ? (
            <p role="status" className="text-meta text-ink-faint">
              {notice}
            </p>
          ) : null}
          <div className="flex justify-between gap-3 text-meta">
            <button
              type="button"
              disabled={pending}
              onClick={() => void requestCode(true)}
              className="text-ink-faint underline underline-offset-4 hover:text-ink disabled:opacity-50"
            >
              Send a new code
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setNotice(null);
              }}
              className="text-ink-faint underline underline-offset-4 hover:text-ink disabled:opacity-50"
            >
              Use a different address
            </button>
          </div>
        </form>
      )}

      {error ? (
        <p role="alert" className="text-meta text-reach">
          {error}
        </p>
      ) : null}
    </div>
  );
}
