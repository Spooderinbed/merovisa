import { Card } from "@/components/ui/card";

/**
 * Navigation loading state for signed-in routes. Their server components read live
 * Supabase data; while that resolves, Next streams this calm skeleton instead of a
 * blank frame, so a slow connection looks like loading rather than a hang. No
 * spinner — flat paper blocks in the "calm authority" language.
 */
export default function AppLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-48 animate-pulse rounded-md bg-bg-tint" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card className="h-40 animate-pulse" />
        <Card className="h-40 animate-pulse" />
      </div>
      <Card className="h-24 animate-pulse" />
    </div>
  );
}
