import { Card } from "@/components/ui/card";

/**
 * The case frame's loading silhouette (spec §5: "a case-header skeleton, section
 * rail, and two flat content panels").
 *
 * ## Why this lives here and not in `[caseId]/`
 *
 * A route-segment `loading.tsx` renders INSIDE its own segment's layout, so
 * `[caseId]/loading.tsx` can only ever appear once the case frame has already
 * resolved — by which point the real header and the real section rail are on
 * screen, and a second set drawn beneath them is a duplicate, not a skeleton.
 * Measured in the browser on 2026-08-19: with a delay in the frame layout, the
 * boundary Next actually reaches for is the nearest ANCESTOR — which, before this
 * file existed, was the organization queue's eight-row skeleton. Opening one
 * student rendered a full queue.
 *
 * This segment is that ancestor, so this is where the frame's silhouette belongs.
 * `[caseId]/loading.tsx` keeps the part that is still true once the frame is up:
 * the panels.
 *
 * ## The accepted mismatch
 *
 * This boundary also covers All cases and Add a student, which are not frames. A
 * shape mismatch on two secondary destinations is the price of the primary Day
 * view → case navigation — by far the most travelled path in the workspace —
 * showing the right silhouette instead of a queue that is not loading. It states
 * nothing false either way: no route is named and no count is claimed.
 */
export default function CaseFrameLoading() {
  return (
    <div className="flex w-full flex-col" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Mirrors `CaseContextHeader`: full-bleed band, hairline beneath, content on
          the 1120 column. */}
      <section data-testid="case-header-skeleton" className="border-b border-line">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-5 pb-4 pt-8">
          <div className="h-4 w-24 animate-pulse rounded-md bg-bg-tint" />
          <div className="h-8 w-64 animate-pulse rounded-md bg-bg-tint" />
          <div className="h-4 w-40 animate-pulse rounded-md bg-bg-tint" />
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-[1120px] flex-col md:grid md:grid-cols-[184px_minmax(0,1fr)] md:items-start">
        {/* A block rather than the seven real links: the section list is built by
            the frame from route facts, and offering navigation before the frame it
            belongs to exists would hand a reader somewhere to click too early. */}
        <div
          data-testid="case-rail-skeleton"
          className="border-b border-line px-4 py-4 md:border-b-0 md:border-r md:px-2 md:py-8"
        >
          <div className="h-7 w-full animate-pulse rounded-md bg-bg-tint" />
        </div>
        <div className="flex min-w-0 flex-col gap-5 px-5 py-8">
          <Card data-testid="case-panel-skeleton" className="h-40 animate-pulse" />
          <Card data-testid="case-panel-skeleton" className="h-40 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
