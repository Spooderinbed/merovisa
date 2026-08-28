"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmailSignIn } from "@/components/auth/email-sign-in";
import {
  ACCEPT_CONFIRMATION,
  ACCEPT_PROMPT,
  ACCEPT_SIGN_IN_PROMPT,
} from "@/lib/invitations/accept-messages";

/**
 * MV-194 — the two states of the invitation page (Stage 5 slice 2).
 *
 * ## Sign-in happens IN PLACE, and that is the answer to the card's sharp edge
 *
 * A student clicking their link is usually not signed in, and the card requires them to come
 * back "without the token being lost and without it riding in the OTP redirect URL". Those
 * two are usually a trade — carry the destination through the auth flow and the credential
 * travels with it; do not carry it and the student lands somewhere else.
 *
 * They stop being a trade once the page never navigates. `EmailSignIn` is given
 * `onSignedIn`, so the six-digit code is exchanged for a session by `fetch` and this
 * component calls `router.refresh()`: same URL, same tab, no redirect, nothing to lose. The
 * token is passed no `next`, reaches no auth endpoint, and enters no `emailRedirectTo`.
 *
 * A COOKIE WAS THE OBVIOUS ALTERNATIVE AND IS DELIBERATELY NOT USED. Stashing the token so
 * it survives a round trip would create a SECOND copy of a live bearer credential, on the
 * same device, outliving the page that needed it — which is the thing this whole slice is
 * built to avoid. There is no round trip to survive.
 *
 * **Google sign-in is absent here on purpose.** OAuth needs a return URL, and the only
 * honest one is `/invite/<token>` — which would put the credential in a `redirect_to`
 * parameter handed to Google, in Google's logs and in the callback's `Location` header. The
 * email code needs no return URL at all. The email carries no link either (see
 * `EmailSignIn`'s header and `supabase/templates/`), so there is no emailed URL for the
 * token to be lost behind.
 *
 * ## Accepting is a POST, and the token rides in its BODY
 *
 * Never a query string: a token in a URL lands in access logs, in `Referer` headers and in
 * browser history. The page's own URL is the one unavoidable exception and it is why
 * `next.config.ts` sends `Referrer-Policy: no-referrer` for `/invite/*`.
 *
 * ## The copy is in `lib/invitations/accept-messages.ts`, not here
 *
 * The founder decision of 2026-08-24 keeps a returning student's two cases separate, which
 * means they will see an EMPTY consultancy case and the product owes them an honest reason.
 * That obligation is testable text, and text living in a component is text a later author
 * edits without meeting the test. `tests/invitations/accept-copy.test.ts` reads that module.
 */

interface InviteAcceptPanelProps {
  /**
   * The plaintext token, present ONLY when a session exists.
   *
   * The page withholds it from this component entirely while the visitor is signed out
   * (decision B), so an unauthenticated browser never receives the credential in an RSC
   * payload — it has it in the address bar and nowhere else.
   */
  token: string | null;
  /** The signed-in account's address, so a mismatch is diagnosable before pressing anything. */
  email: string | null;
}

type Phase = "idle" | "accepting" | "accepted";

export function InviteAcceptPanel({ token, email }: InviteAcceptPanelProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [alreadyLinked, setAlreadyLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrongAddress, setWrongAddress] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // DECISION B — a visitor who has proven nothing is told nothing. Not whether the
  // invitation exists, not which consultancy sent it, not who it names. "Sign in to
  // continue" leaks precisely nothing, and the token is not in this branch's props.
  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[clamp(24px,3vw,32px)]">{ACCEPT_SIGN_IN_PROMPT.heading}</h1>
          <p className="text-lead text-ink-soft">{ACCEPT_SIGN_IN_PROMPT.body}</p>
        </div>
        <EmailSignIn onSignedIn={() => router.refresh()} />
      </div>
    );
  }

  if (phase === "accepted") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-[clamp(24px,3vw,32px)]">{ACCEPT_CONFIRMATION.heading}</h1>
        {alreadyLinked ? (
          <p role="status" className="text-body text-ink-soft">
            {ACCEPT_CONFIRMATION.alreadyLinked}
          </p>
        ) : null}
        <p className="text-lead text-ink-soft">{ACCEPT_CONFIRMATION.body}</p>
        <p className="text-body text-ink-soft">{ACCEPT_CONFIRMATION.separateCases}</p>
        <p className="text-small text-ink-faint">{ACCEPT_CONFIRMATION.dashboardNote}</p>
        <Link
          href="/dashboard"
          className="mt-1 self-start rounded-full bg-primary px-5 py-2.5 text-on-primary"
        >
          Go to your dashboard
        </Link>
      </div>
    );
  }

  const accept = async () => {
    setPhase("accepting");
    setError(null);
    setWrongAddress(false);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // THE TOKEN IS IN THE BODY. Not the path, not a query parameter, not a header a
        // proxy logs by default.
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        reason?: string;
        alreadyLinked?: boolean;
      };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "We couldn't accept this invitation just now. Try again in a minute.");
        // The one refusal with an action attached: they may simply be signed in as the
        // wrong person, which is precisely what decision A exists to catch.
        setWrongAddress(data.reason === "email-mismatch");
        setPhase("idle");
        return;
      }
      setAlreadyLinked(data.alreadyLinked === true);
      setPhase("accepted");
      // So any server component reading the session's cases sees the new one.
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setPhase("idle");
    }
  };

  const signOutAndStay = async () => {
    setSigningOut(true);
    try {
      // `fetch` rather than a form POST: a form submission is a navigation, and under
      // `Referrer-Policy: no-referrer` a navigation POST sends `Origin: null`, which the
      // sign-out route correctly reads as a cross-site request. A `fetch` carries the real
      // origin. The redirect it answers with is followed and discarded — we stay here.
      await fetch("/auth/signout", { method: "POST" });
    } catch {
      // Signed in or out, the refresh below shows the truth.
    } finally {
      setSigningOut(false);
      router.refresh();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-[clamp(24px,3vw,32px)]">{ACCEPT_PROMPT.heading}</h1>
        <p className="text-lead text-ink-soft">{ACCEPT_PROMPT.body}</p>
        <p className="text-body text-ink-soft">{ACCEPT_CONFIRMATION.separateCases}</p>
      </div>

      {email ? (
        <p className="text-meta text-ink-faint">
          Signed in as <span className="font-mono">{email}</span>
        </p>
      ) : null}

      <Button onClick={() => void accept()} loading={phase === "accepting"} loadingLabel="Accepting">
        {ACCEPT_PROMPT.action}
      </Button>

      {error ? (
        <p role="alert" className="text-meta text-reach">
          {error}
        </p>
      ) : null}

      {wrongAddress ? (
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void signOutAndStay()}
          className="self-start text-meta text-ink-faint underline underline-offset-4 hover:text-ink disabled:opacity-50"
        >
          Sign out and use a different address
        </button>
      ) : null}
    </div>
  );
}
