"use client";

import { Button } from "@/components/ui/button";
import { ASSESSMENT_TTL_DAYS } from "@/lib/assessments/expiry";
import { startClaimOAuth } from "@/lib/auth/start-claim-oauth";

function expiryDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() + ASSESSMENT_TTL_DAYS * 24 * 60 * 60 * 1000);
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

export function ConversionPaths({ assessmentId }: { assessmentId: string | null }) {
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
          <Button size="lg" onClick={() => void startClaimOAuth(assessmentId)} disabled={!assessmentId}>
            Continue with Google
          </Button>
        </div>
      </div>
    </section>
  );
}
