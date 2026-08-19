"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/card";

/**
 * Error boundary for the team roster (spec §5, "Team failure: preserve the team
 * heading and use the current explicit outage language").
 *
 * The heading is re-rendered here rather than inherited: it lives inside
 * `team/page.tsx`, and an error boundary REPLACES the page it guards, so a reader
 * who lost the roster would otherwise also lose the only word telling them which
 * page they are on.
 *
 * The wording is `TeamLookupFailedCard`'s, verbatim — the card the page already
 * renders for a failed permission lookup and for a failed roster read. It says less
 * than the queue's ("please try again in a moment", with no sentence about access)
 * because it is the page's own established language, and this slice adopts it rather
 * than inventing a fourth phrasing of the same event.
 *
 * A denial is not an outage: a viewer without an active membership gets
 * `notFound()` from the page, upstream of this boundary.
 */
export default function TeamError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[workspace] team route error", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Team</h1>
      </header>

      <Card as="section" padding="lg" className="flex flex-col items-start gap-3">
        <h2 className="text-title font-medium">We couldn&apos;t load the team</h2>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Something went wrong on our side. Please try again in a moment.
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
