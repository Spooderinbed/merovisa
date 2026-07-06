"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ASSESSMENT_TTL_DAYS } from "@/lib/assessments/expiry";
import { startClaimOAuth } from "@/lib/auth/start-claim-oauth";

function expiryDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() + ASSESSMENT_TTL_DAYS * 24 * 60 * 60 * 1000);
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

export function ConversionPaths({
  assessmentId,
  onRetrySave,
  retryingSave = false,
}: {
  assessmentId: string | null;
  /** Re-POSTs the already-computed answers in place — supplied by AssessFlow. */
  onRetrySave?: () => void;
  retryingSave?: boolean;
}) {
  // The anonymous assessment failed to persist (id:null) — there is nothing to
  // claim, so we never show a dead "keep it" button or the false 3-day expiry.
  // The results are already computed and on screen; only the server save failed,
  // so the recovery is an in-place retry of the same answers — not a link that
  // wipes the wizard and forces a full re-answer.
  if (!assessmentId) {
    return (
      <section className="flex flex-col gap-4">
        <Card padding="lg">
          <h3 className="text-headline">We couldn&apos;t save this assessment</h3>
          <p className="mt-2 text-body text-ink-soft">
            Your results above are accurate — they just weren&apos;t saved. Try again;
            there&apos;s no need to redo any of your answers.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={onRetrySave}
              disabled={retryingSave}
              className="inline-flex items-center rounded-pill bg-primary px-7 py-[15px] text-lead font-medium text-on-primary hover:bg-primary-ink disabled:opacity-60"
            >
              {retryingSave ? "Saving…" : "Try saving again"}
            </button>
          </div>
        </Card>
      </section>
    );
  }

  // Creating a Google account is the only way to keep an anonymous assessment —
  // there is no email-delivery or anonymous-retrieval path, so we don't imply one.
  return (
    <section className="flex flex-col gap-4">
      <Card padding="lg">
        <h3 className="text-headline">Keep your assessment</h3>
        <p className="mt-2 text-body text-ink-soft">
          Your assessment expires in 3 days (by {expiryDate()}). Create a free account with Google to keep it and
          get updates as visa rules change.
        </p>
        <div className="mt-4">
          <Button size="lg" onClick={() => void startClaimOAuth(assessmentId)}>
            Continue with Google
          </Button>
        </div>
      </Card>
    </section>
  );
}
