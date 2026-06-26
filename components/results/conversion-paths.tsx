"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ASSESSMENT_TTL_DAYS } from "@/lib/assessments/expiry";
import { startClaimOAuth } from "@/lib/auth/start-claim-oauth";

function expiryDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() + ASSESSMENT_TTL_DAYS * 24 * 60 * 60 * 1000);
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

export function ConversionPaths({ assessmentId }: { assessmentId: string | null }) {
  // The anonymous assessment failed to persist (id:null) — there is nothing to
  // claim, so we never show a dead "keep it" button or the false 3-day expiry.
  // We say plainly it wasn't saved and offer the one real recovery: run it again.
  if (!assessmentId) {
    return (
      <section className="flex flex-col gap-4">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h3 className="text-[21px]">We couldn&apos;t save this assessment</h3>
          <p className="mt-2 text-[15px] text-ink-soft">
            Your results above are accurate, but they weren&apos;t saved — they&apos;ll be gone
            once you close this page. Run the assessment again to try saving it.
          </p>
          <div className="mt-4">
            <Link
              href="/assess?new=1"
              className="inline-flex items-center rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink"
            >
              Run it again
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Creating a Google account is the only way to keep an anonymous assessment —
  // there is no email-delivery or anonymous-retrieval path, so we don't imply one.
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface p-6">
        <h3 className="text-[21px]">Keep your assessment</h3>
        <p className="mt-2 text-[15px] text-ink-soft">
          Your assessment expires in 3 days (by {expiryDate()}). Create a free account with Google to keep it and
          get updates as visa rules change.
        </p>
        <div className="mt-4">
          <Button size="lg" onClick={() => void startClaimOAuth(assessmentId)}>
            Continue with Google
          </Button>
        </div>
      </div>
    </section>
  );
}
