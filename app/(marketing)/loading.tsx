import { Card } from "@/components/ui/card";

/**
 * Navigation loading state for the (marketing) pages. Their server components read
 * live Supabase data (the session probe); while the page below the marketing chrome
 * resolves, Next streams this calm skeleton instead of a blank frame, so a slow
 * connection reads as loading rather than a hang. Shaped like a marketing page — a
 * wide hero block over a couple of content bands — in the flat "calm authority"
 * language. No spinner.
 */
export default function MarketingLoading() {
  return (
    <div
      className="mx-auto flex min-h-[60vh] w-full max-w-[1120px] flex-col gap-6 px-5 py-16"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <div className="h-10 w-64 animate-pulse rounded-md bg-bg-tint" />
      <div className="h-24 w-full max-w-[640px] animate-pulse rounded-md bg-bg-tint" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Card className="h-40 animate-pulse" />
        <Card className="h-40 animate-pulse" />
        <Card className="h-40 animate-pulse" />
      </div>
    </div>
  );
}
