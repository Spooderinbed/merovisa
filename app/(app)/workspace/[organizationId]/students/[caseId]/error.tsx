"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/card";

/**
 * Error boundary for the case segment (spec §5, "Case lookup failure"). It renders
 * inside the persistent frame — Next.js hands a segment's layout errors to the
 * PARENT boundary, so by the time this one is reached the case header, the section
 * rail and the way back to the Day view are all still mounted. That is what
 * "preserve the workspace shell" buys: a counsellor keeps the context that says
 * whose case they were reading, and only the section beneath it failed.
 *
 * The copy is `CaseRouteOutage`'s, verbatim, for the reason the queue boundary
 * states: the frame's caught outage and this uncaught throw are the same event to
 * the reader, and one wording is what keeps them from drifting apart.
 *
 * Never `notFound()`. Telling a counsellor their student does not exist because a
 * read blipped is a denial dressed as a fact; denials are decided upstream, by
 * `openCaseRoute`, and reach this boundary never.
 */
export default function CaseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[workspace] case route error", error);
  }, [error]);

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-8">
      <Card as="section" padding="lg" className="flex flex-col items-start gap-3">
        <h1 className="text-title font-medium">We couldn&apos;t load this student</h1>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Something went wrong on our side. This is not a statement about this student or your
          access — please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center rounded-pill bg-primary px-6 py-3 text-control font-medium text-on-primary hover:bg-primary-ink"
        >
          Try again
        </button>
      </Card>
    </div>
  );
}
