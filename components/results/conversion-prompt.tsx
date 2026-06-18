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
export function ConversionPrompt({ assessmentId }: { assessmentId: string | null }) {
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
        disabled={!assessmentId}
        className="shrink-0"
      >
        Continue with Google
      </Button>
    </section>
  );
}
