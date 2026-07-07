"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Journey, JourneyStage } from "@/lib/journey/journey";
import { cn } from "@/lib/utils";

// MV-103 — the slim, persistent counterpart of the dashboard "Your journey" rail
// (MV-77). It rides in the signed-in chrome so a student deep in /matches or
// /documents still sees where they are on the six-step path without navigating
// back to the dashboard — the orientation a confused student would otherwise seek
// from a consultancy. It reuses buildJourney's state verbatim, so it can never
// light a step the dashboard rail wouldn't, and shares the dot vocabulary of the
// dashboard rail and the MV-73 outcome rail so the three read as one family.

function dotCls(stage: JourneyStage): string {
  const reached = stage.status === "done" || stage.status === "in-progress";
  return cn(
    "h-1.5 w-1.5 rounded-full",
    reached ? "border border-strong bg-strong" : "border border-line bg-surface",
    stage.current && "ring-2 ring-strong/30",
  );
}

export function JourneyMarker({ journey }: { journey: Journey }) {
  const pathname = usePathname();
  // The rich rail already occupies the dashboard; a marker there would show the
  // same six steps twice on one screen.
  if (pathname === "/dashboard") return null;

  const total = journey.stages.length;
  const currentIndex = Math.max(
    0,
    journey.stages.findIndex((s) => s.current),
  );
  const current = journey.stages[currentIndex];
  const stepN = currentIndex + 1;

  return (
    <div data-testid="journey-marker" className="border-b border-line bg-bg">
      <Link
        href="/dashboard"
        aria-label={`${journey.ariaLabel} Step ${stepN} of ${total}. Open your journey.`}
        className="mx-auto flex w-full max-w-[1120px] items-center gap-3 px-5 py-2 text-small transition-colors ease-calm hover:bg-bg-tint"
      >
        <span
          data-testid="journey-marker-dots"
          aria-hidden
          className="hidden items-center gap-1.5 md:flex"
        >
          {journey.stages.map((stage) => (
            <span key={stage.key} className={dotCls(stage)} />
          ))}
        </span>
        <span aria-hidden className="text-ink-soft">
          <span className="font-medium text-ink">{current?.label}</span>
          {" · "}
          <span className="font-mono text-caption uppercase tracking-wide text-ink-faint">
            step {stepN} of {total}
          </span>
        </span>
        <span aria-hidden className="ml-auto text-ink-faint">
          ›
        </span>
      </Link>
    </div>
  );
}
