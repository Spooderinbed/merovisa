"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ClaimErrorCode } from "@/lib/auth/claim-error";
import { readPersistedAssessmentId, clearPersistedResults } from "@/lib/results/persisted-results";

/**
 * Honest recovery for a claim/OAuth failure bounced back to /assess (audit C-9 / MV-130).
 *
 * Every failure the sign-in seam can hit now lands here with a `?error=` code instead
 * of a silent `?new`-only render that drops the most motivated student in the funnel.
 * Follows the MV-133 idiom: state the true failure plainly, then offer a path that
 * actually works rather than a generic error. Which path depends on where the work is:
 *
 * - The assessment is still saved on this device (sessionStorage survives the OAuth
 *   round-trip) → offer to finish linking it in place, reusing the one claim path
 *   (anonymous: re-run sign-in from the restored results; signed-in: /api/assess/claim).
 * - It's gone (expired/purged) or bound elsewhere → say so, and point to a fresh start.
 */
const COPY: Record<ClaimErrorCode, { heading: string; body: string }> = {
  auth: {
    heading: "Sign-in didn't finish",
    body: "We couldn't complete sign-in, so your assessment wasn't linked to an account. If you finished an assessment, it's still saved on this device — pick it back up and try signing in again.",
  },
  "invalid-claim": {
    heading: "We couldn't link your assessment",
    body: "You're signed in, but the link carrying your assessment couldn't be verified. If it's still saved on this device you can finish linking it now; otherwise start a fresh one.",
  },
  "claim-failed": {
    heading: "Something interrupted linking your assessment",
    body: "You're signed in and your assessment is still saved — this was a temporary problem, not lost work. Try linking it again.",
  },
  expired: {
    heading: "This assessment has expired",
    body: "Assessments are kept for 3 days. This one expired and was deleted, so it can't be linked to your account. Start a new one to get an up-to-date verdict.",
  },
  claimed: {
    heading: "This assessment is linked to another account",
    body: "It's already saved to a different account. Sign in with that account to open it, or start a new assessment here.",
  },
};

// Terminal states: the assessment is gone or belongs to someone else, so a retry
// here can never succeed — we don't offer one, only a fresh start.
const TERMINAL: ReadonlySet<ClaimErrorCode> = new Set(["expired", "claimed"]);

export function ClaimFailure({ reason, signedIn }: { reason: ClaimErrorCode; signedIn: boolean }) {
  const router = useRouter();
  // The displayed reason can change: a "temporary" retry can come back revealing the
  // row is actually claimed elsewhere or expired, at which point we stop retrying.
  const [current, setCurrent] = useState<ClaimErrorCode>(reason);
  const [preservedId, setPreservedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "claiming" | "retry-failed">("idle");

  // Read the preserved assessment after mount only — sessionStorage is client-only,
  // and reading it during render would diverge SSR from the first client paint.
  /* eslint-disable react-hooks/set-state-in-effect -- one-time client-only read of
     sessionStorage; the SSR + first client render already emitted the stable message
     shell, so this post-commit seed is intended, not a render loop (mirrors MV-118 #3
     in assess-flow). */
  useEffect(() => {
    // A truly expired/deleted assessment leaves stale results behind; drop them so a
    // later visit doesn't restore a zombie verdict for a row that no longer exists.
    if (TERMINAL.has(reason)) clearPersistedResults();
    setPreservedId(TERMINAL.has(reason) ? null : readPersistedAssessmentId());
    setReady(true);
  }, [reason]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const copy = COPY[current];
  const terminal = TERMINAL.has(current);
  const canRecover = ready && !terminal && preservedId !== null;

  // Signed-in recovery: finish the claim the redirect couldn't, in place.
  const retryClaim = async () => {
    if (!preservedId) return;
    setStatus("claiming");
    try {
      const res = await fetch("/api/assess/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: preservedId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redirectTo?: string; reason?: string };
      if (res.ok && data.ok && typeof data.redirectTo === "string") {
        router.push(data.redirectTo);
        return;
      }
      // The row turned out gone or claimed elsewhere — switch to that honest, terminal
      // state so we stop offering a retry that can't win. A transient miss stays retryable.
      if (data.reason === "claimed") setCurrent("claimed");
      else if (data.reason === "expired") setCurrent("expired");
      else setStatus("retry-failed");
    } catch {
      setStatus("retry-failed");
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-5 py-16 text-center">
      <h1 className="text-[clamp(28px,3.4vw,40px)]">{copy.heading}</h1>
      <p className="text-lead text-ink-soft">{copy.body}</p>
      {status === "retry-failed" ? (
        <p role="alert" className="text-body text-reach">
          That didn&apos;t go through. Your assessment is still saved — try again.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {canRecover && !signedIn ? (
          // Anonymous: their results are restorable — send them back to re-run sign-in
          // from the results screen, where the claim actually gets carried.
          <Link
            href="/assess"
            className="inline-flex rounded-pill bg-primary px-7 py-[15px] text-lead font-medium text-on-primary hover:bg-primary-ink"
          >
            Back to your results
          </Link>
        ) : null}
        {canRecover && signedIn ? (
          <Button
            size="lg"
            onClick={() => void retryClaim()}
            loading={status === "claiming"}
            loadingLabel="Linking"
          >
            {status === "retry-failed" ? "Try again" : "Link my assessment"}
          </Button>
        ) : null}
        <Link
          href="/assess?new=1"
          className="inline-flex rounded-pill border border-line-2 px-7 py-[15px] text-lead text-ink hover:bg-bg-tint"
        >
          Start a new assessment
        </Link>
        {signedIn ? (
          <Link
            href="/dashboard"
            className="inline-flex rounded-pill border border-line-2 px-7 py-[15px] text-lead text-ink hover:bg-bg-tint"
          >
            Open my dashboard
          </Link>
        ) : null}
      </div>
    </section>
  );
}
