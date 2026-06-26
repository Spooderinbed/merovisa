"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown in the root layout itself, where the
 * per-segment error.tsx cannot reach. It replaces the whole document, so it must
 * render its own <html>/<body>. Kept inline-styled and dependency-free on purpose —
 * the app's CSS or fonts may be exactly what failed to load, so we can't rely on
 * Tailwind classes resolving here. Brand colours are hard-coded to match.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] root error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          backgroundColor: "#f6f5f1",
          color: "#23231f",
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
        }}
      >
        <main style={{ maxWidth: 520, margin: "0 auto", padding: "80px 20px" }}>
          <h1 style={{ fontSize: 24, lineHeight: 1.3, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 15, color: "#55554e", marginTop: 12 }}>
            We hit an unexpected error loading MyVisa. Your saved data is safe. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              borderRadius: 999,
              border: 0,
              backgroundColor: "#0f5e54",
              color: "#ffffff",
              padding: "12px 24px",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
