import { Card } from "@/components/ui/card";

/**
 * Loading state for the team roster (spec §5: "Team and settings loading preserve
 * the workspace shell and skeleton only their content").
 *
 * The shell — the consultancy top bar and the organization rail — is mounted by the
 * layouts above this segment and is untouched while this renders, which is what
 * "preserve" means here: this file draws no chrome of its own.
 *
 * The heading is real. Unlike the queue boundary, this one sits on a single-page
 * segment and can appear over nothing else, so "Team" is a fact rather than a guess
 * — and it gives a reader something settled to look at while the roster resolves.
 */
export default function TeamLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Team</h1>
        <div className="h-4 w-full max-w-[52ch] animate-pulse rounded-md bg-bg-tint" />
      </header>

      {/* One card holding the rows, as the roster does — the members are rows inside
          a single panel, not a panel each. */}
      <Card as="section" padding="lg" className="flex flex-col gap-4">
        <div className="h-9 w-full animate-pulse rounded-md bg-bg-tint" />
        <div className="h-9 w-full animate-pulse rounded-md bg-bg-tint" />
        <div className="h-9 w-full animate-pulse rounded-md bg-bg-tint" />
      </Card>
    </div>
  );
}
