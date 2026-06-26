"use client";

import Link from "next/link";
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
  // Persist miss (id:null): nothing to keep, so we don't show a dead "keep it"
  // button — we say it wasn't saved and link to a fresh run (the one real recovery).
  if (!assessmentId) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px] text-ink-soft">
          We couldn&apos;t save this assessment, so it won&apos;t be kept. Run it again to try saving it.
        </p>
        <Link
          href="/assess?new=1"
          className="inline-flex shrink-0 items-center rounded-pill bg-primary px-[22px] py-3 text-[16px] font-medium text-on-primary hover:bg-primary-ink"
        >
          Run it again
        </Link>
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
