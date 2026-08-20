import { Card } from "@/components/ui/card";

/**
 * Loading state for organization settings (spec §5, the same rule as the team
 * roster): the workspace shell above stays mounted, and only this page's content is
 * skeletoned. The heading is real for the same reason — this boundary sits on a
 * single-page segment and can appear over nothing else.
 */
export default function SettingsLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Organization settings</h1>
        <div className="h-4 w-full max-w-[52ch] animate-pulse rounded-md bg-bg-tint" />
      </header>

      <Card as="section" padding="lg" className="flex flex-col gap-5">
        <div className="h-11 w-full animate-pulse rounded-md bg-bg-tint" />
        <div className="h-11 w-full animate-pulse rounded-md bg-bg-tint" />
        <div className="h-11 w-36 animate-pulse rounded-md bg-bg-tint" />
      </Card>
    </div>
  );
}
