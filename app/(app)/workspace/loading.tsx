import { Card } from "@/components/ui/card";

/**
 * Loading state for the consultancy workspace as a whole (spec §6 — the shared
 * `(app)` states "split into student and workspace variants").
 *
 * ## Why `[organizationId]/loading.tsx` was not enough
 *
 * A segment's `loading.tsx` is mounted INSIDE that segment's own layout, so it can
 * never stand in for the layout above it. `[organizationId]/layout.tsx` reads the
 * actor's organizations before it can render the organization band, and while that
 * read was in flight the nearest fallback was `app/(app)/loading.tsx` — the STUDENT
 * dashboard's silhouette, one heading over a `1.5fr_1fr` card grid. A counsellor
 * opening a queue watched their own dashboard's shape paint first, which is the
 * exact mismatch the queue skeleton was written to remove. This file closes that
 * half of the gap; `workspace/layout.tsx` streaming its bar closes the other.
 *
 * The workspace bar is NOT redrawn here. It is mounted by the layout above this
 * fallback and is already on screen, so a copy would double the chrome the moment
 * this appeared.
 *
 * It names no route, for the reason the queue skeleton names none: this boundary
 * covers the queue, All cases, Add a student, Team and Settings alike, and the
 * route's own skeleton takes over the moment the organization layout resolves.
 *
 * Flat paper blocks pulsing in unison, no spinner — `animate-pulse` is the only
 * motion, which is what keeps this inside the global `prefers-reduced-motion` guard
 * in `app/globals.css`.
 */
export default function WorkspaceLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* The organization band, mirroring the real one's border, tint and padding so
          the page's border count and height do not change as the chrome arrives. */}
      <div data-testid="workspace-band-skeleton" className="border-b border-line bg-bg-tint">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3">
          <div className="h-6 w-56 animate-pulse rounded-md bg-bg" />
          <div className="h-6 w-64 animate-pulse rounded-md bg-bg" />
        </div>
      </div>

      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
        <div className="h-10 w-48 animate-pulse rounded-md bg-bg-tint" />
        <Card className="h-16 animate-pulse" />
        <Card className="h-40 animate-pulse" />
      </div>
    </div>
  );
}
