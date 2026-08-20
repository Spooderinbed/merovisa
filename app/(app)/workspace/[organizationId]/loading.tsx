import { Card } from "@/components/ui/card";

/** Eight, per spec §5 — enough to fill the fold at the queue's density without
 *  promising a count the read has not returned yet. */
const ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Loading state for the consultancy queue (spec §5). The shared `(app)` skeleton is
 * student-shaped — one heading over a `1.5fr_1fr` card grid, the dashboard's
 * silhouette — so a slow queue used to resolve into a layout the skeleton never
 * suggested. This one is the queue's own silhouette: summary strip, toolbar, rows.
 *
 * The heading is a block rather than the words "Day view". A route-segment loading
 * file covers every descendant without a closer boundary, so this also appears over
 * All cases and Add a student; painting a route name here would name the wrong one.
 *
 * No spinner and no row-by-row stagger: flat paper blocks pulsing in unison, in the
 * "calm authority" language. `animate-pulse` is the only motion, which is what keeps
 * the whole skeleton inside the global `prefers-reduced-motion` guard in
 * `app/globals.css`.
 */
export default function QueueLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <header className="flex flex-col gap-2">
        <div
          data-testid="queue-heading-skeleton"
          className="h-10 w-48 animate-pulse rounded-md bg-bg-tint"
        />
      </header>

      {/* The workload strip is a Card at rest, so it is a Card here too — the
          skeleton must not change the page's border count as it resolves. */}
      <Card data-testid="queue-summary-skeleton" className="h-16 animate-pulse" />

      <div
        data-testid="queue-toolbar-skeleton"
        className="h-11 w-full animate-pulse rounded-md bg-bg-tint"
      />

      {/* The rows sit directly on paper, as the real table does — no card around
          them, or the queue would appear to gain a panel and then lose it. */}
      <div className="flex flex-col gap-2">
        {ROWS.map((row) => (
          <div
            key={row}
            data-testid="queue-row-skeleton"
            className="h-9 w-full animate-pulse rounded-md bg-bg-tint"
          />
        ))}
      </div>
    </div>
  );
}
