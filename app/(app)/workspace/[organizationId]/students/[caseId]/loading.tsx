import { Card } from "@/components/ui/card";

/**
 * Loading state for a case SECTION — overview, profile, matches, plan, checklist,
 * documents, case details (spec §5).
 *
 * ## Why there is no header and no rail here
 *
 * This boundary renders inside `[caseId]/layout.tsx`, which means the persistent
 * frame has already resolved by the time it appears: the student's name, the status
 * pills and the section rail are all on screen and stay mounted while the section
 * beneath them changes. A header skeleton drawn here would be a SECOND header under
 * the real one — measured in the browser on 2026-08-19, and the reason the frame's
 * own silhouette moved one segment up, to `students/loading.tsx`.
 *
 * So this is the two flat content panels and nothing else, sitting in the frame's
 * content column. Moving between sections leaves the case's identity untouched and
 * refills only the part that is actually changing, which is the whole point of the
 * frame being a layout rather than a wrapper.
 *
 * No spinner, no per-panel stagger, `animate-pulse` only — the global
 * `prefers-reduced-motion` guard in `app/globals.css` covers it for that reason.
 */
export default function CaseSectionLoading() {
  return (
    <div className="flex min-w-0 flex-col gap-5 px-5 py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Card data-testid="case-panel-skeleton" className="h-40 animate-pulse" />
      <Card data-testid="case-panel-skeleton" className="h-40 animate-pulse" />
    </div>
  );
}
