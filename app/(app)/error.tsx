"use client";

import { useEffect } from "react";

/**
 * Segment error boundary for every signed-in route (dashboard, matches, plan,
 * profile, documents, checklist, guide). A live Supabase read — e.g. the
 * dashboard's six-way Promise.all or the matches page's four-way one — that throws
 * lands here instead of crashing the whole shell to a white screen or a raw stack.
 * The student gets a calm, branded retry. Resilient by default: the real user is
 * often on a flaky Nepal connection, so a transient read failure must recover, not
 * dead-end them out of the product (every dead-end is a bounce to a consultancy).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-narrow flex-col items-start gap-4 px-5 py-16">
      <p className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Something went wrong
      </p>
      <h1 className="text-[24px] leading-snug text-ink">We couldn&apos;t load this page</h1>
      <p className="text-[15px] text-ink-soft">
        This is usually a temporary connection hiccup, not a problem with your account — your saved
        data is safe. Try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center rounded-pill bg-primary px-6 py-3 text-[16px] font-medium text-on-primary hover:bg-primary-ink"
      >
        Try again
      </button>
    </div>
  );
}
