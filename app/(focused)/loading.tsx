/**
 * Navigation loading state for the focused (results) routes. The assessment/[id]
 * server component reads live Supabase data (the recovered assessment, plus a
 * catalogue recompute for legacy-shape rows); while that resolves, Next streams this
 * calm skeleton instead of a blank frame, so a slow Nepal connection reads as loading
 * rather than a hang. Shaped like the results column — a verdict block over match
 * cards — in the flat "calm authority" language. No spinner.
 */
export default function FocusedLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-narrow flex-col gap-6 px-5 py-10"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <div className="h-6 w-40 animate-pulse rounded-md bg-bg-tint" />
      <div className="h-44 animate-pulse rounded-lg border border-line bg-surface" />
      <div className="h-28 animate-pulse rounded-lg border border-line bg-surface" />
      <div className="h-28 animate-pulse rounded-lg border border-line bg-surface" />
    </div>
  );
}
