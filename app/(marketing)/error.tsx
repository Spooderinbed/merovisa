"use client";

import { useEffect } from "react";

/**
 * Segment error boundary for the (marketing) group — the first-impression surface
 * (landing, how, trust, destinations, auth). Its page.tsx and auth/page.tsx do live
 * Supabase reads (the session probe that gates the signed-in redirect); a throw there
 * used to bubble past the layout to global-error, which replaces the whole document.
 * This catches it inside the marketing chrome and offers a calm retry, so a transient
 * read failure recovers in place rather than dead-ending a first-time visitor (every
 * dead-end is a bounce to a consultancy). Copy stays honest: an anonymous visitor has
 * nothing saved server-side, so — unlike the signed-in boundary — we make no
 * "saved data is safe" claim; it's a connection hiccup, and retrying is the fix.
 *
 * Note: a throw in the same-segment layout.tsx (its own auth.getUser() probe) is NOT
 * caught here — it bubbles to global-error. That path is handled separately by a
 * try/catch in layout.tsx that degrades to the signed-out chrome (MV-70).
 */
export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[marketing] route error", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-narrow flex-col items-start gap-4 px-5 py-16">
      <p className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Something went wrong
      </p>
      <h1 className="text-[24px] leading-snug text-ink">We couldn&apos;t load this page</h1>
      <p className="text-[15px] text-ink-soft">
        This is usually a brief connection hiccup, not a problem on your end. Try again in a moment.
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
