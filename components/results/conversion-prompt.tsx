"use client";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/events";
import { startClaimOAuth } from "@/lib/auth/start-claim-oauth";

/**
 * Compact OAuth prompt shown directly under the verdict/factor area on the
 * anonymous results page — captures the conversion moment while the verdict is
 * still on screen, instead of waiting for the full ConversionPaths card at the
 * bottom. Anonymous mode only; never rendered for signed-in (owned) results.
 */
export function ConversionPrompt({
  assessmentId,
  onRetrySave,
  retryingSave = false,
}: {
  assessmentId: string | null;
  /** Re-POSTs the already-computed answers in place — supplied by AssessFlow. */
  onRetrySave?: () => void;
  retryingSave?: boolean;
}) {
  // Persist miss (id:null): the results are already computed and on screen — only
  // the server save failed. We don't show a dead "keep it" button, nor a link that
  // wipes the wizard and results; we offer an in-place retry of the same answers.
  if (!assessmentId) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px] text-ink-soft">
          We couldn&apos;t save this — your results are still here. Try again.
        </p>
        <button
          type="button"
          onClick={onRetrySave}
          disabled={retryingSave}
          className="inline-flex shrink-0 items-center rounded-pill bg-primary px-[22px] py-3 text-[16px] font-medium text-on-primary hover:bg-primary-ink disabled:opacity-60"
        >
          {retryingSave ? "Saving…" : "Try saving again"}
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[15px] text-ink-soft">
        Keep this assessment and get updates as visa rules change.
      </p>
      <Button
        onClick={() => {
          track("gate_cta_clicked");
          void startClaimOAuth(assessmentId);
        }}
        className="shrink-0"
      >
        Continue with Google
      </Button>
    </section>
  );
}
