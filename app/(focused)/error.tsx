"use client";

import { useEffect } from "react";

/**
 * Segment error boundary for the focused (results) routes: the anonymous wizard +
 * results (assess) and the recovered/saved assessment view (assessment/[id]). Both
 * do live Supabase reads — getRecoverableAssessment, listAllPrograms, the signed-in
 * getPrimaryAssessmentForUser. A throw there used to bubble past the layout to
 * global-error, which replaces the whole document (no FocusBar, bare inline styling)
 * — a jarring dead-end on the single most conversion-critical surface. This catches
 * it inside the layout and offers a calm, in-place retry. The real user is often on a
 * flaky Nepal connection, so a transient read failure must recover, not bounce them
 * out of the product (every dead-end is a bounce to a consultancy). Copy stays honest:
 * the anonymous case may have nothing saved server-side, so we claim only what's true
 * — it's usually the connection, and retrying is the fix.
 */
export default function FocusedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[focused] results route error", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-narrow flex-col items-start gap-4 px-5 py-16">
      <p className="font-mono text-caption uppercase tracking-wide text-ink-faint">
        Something went wrong
      </p>
      <h1 className="text-display leading-snug text-ink">We couldn&apos;t load your results</h1>
      <p className="text-body text-ink-soft">
        This is usually a brief connection hiccup, not a problem on your end. Try again in a
        moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center rounded-pill bg-primary px-6 py-3 text-control font-medium text-on-primary hover:bg-primary-ink"
      >
        Try again
      </button>
    </div>
  );
}
