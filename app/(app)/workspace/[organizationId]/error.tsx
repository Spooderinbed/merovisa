"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { useRouteRetry } from "@/components/layout/use-route-retry";

/**
 * Error boundary for the consultancy queue (spec §5, "Queue failure"). The shared
 * `(app)` boundary is the student's — "your saved data is safe", written for someone
 * reading their own assessment — and it is the wrong sentence for a counsellor who
 * has just lost sight of a queue of other people's cases.
 *
 * ## The copy is `QueueFailedCard`'s, verbatim
 *
 * The page already renders that wording when a read it EXPECTED to fail comes back
 * `lookup-failed`. This boundary catches the throw it did not expect. A reader
 * cannot tell those two apart and should not have to, so they say the same thing —
 * one wording for "a read did not complete", which is also what stops the two from
 * drifting into two different explanations of the same blank screen.
 *
 * ## No empty-case claim, ever
 *
 * "We couldn't load this queue" is a statement about the read. "No cases yet" is a
 * statement about the organization. A failure that renders the second tells a
 * consultancy their students are gone — the quiet dishonesty this product exists to
 * avoid — so the empty states live on the page, behind a SUCCESSFUL read, and never
 * here.
 *
 * `lookup-failed` is always an outage, never a permission denial: denials call
 * `notFound()` before anything reaches this boundary, and nothing here converts one
 * into the other in either direction.
 */
export default function QueueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retry = useRouteRetry(reset);

  useEffect(() => {
    console.error("[workspace] queue route error", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      <Card as="section" padding="lg" className="flex flex-col items-start gap-3">
        <h1 className="text-title font-medium">We couldn&apos;t load this queue</h1>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Something went wrong on our side. This is not a statement about this organization or your
          access — please try again in a moment.
        </p>
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center rounded-pill bg-primary px-6 py-3 text-control font-medium text-on-primary hover:bg-primary-ink"
        >
          Try again
        </button>
      </Card>
    </div>
  );
}
