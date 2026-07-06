import Link from "next/link";
import { buildJourney, type JourneySignals, type JourneyStage } from "@/lib/journey/journey";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Calm flat dots, reusing the MV-73 funnel-rail language: a reached stage fills
// teal, the "you are here" stage adds a thin ring, an unreached stage is a hollow
// dot. Wayfinding — never reach-red. Shape + the mono word carry state, not colour.
function dotCls(stage: JourneyStage): string {
  const reached = stage.status === "done" || stage.status === "in-progress";
  return cn(
    "h-2.5 w-2.5 rounded-full",
    reached ? "border border-strong bg-strong" : "border border-line bg-surface",
    stage.current && "ring-2 ring-strong/30",
  );
}

function labelCls(stage: JourneyStage): string {
  if (stage.current) return "text-ink";
  if (stage.status === "todo") return "text-ink-faint";
  return "text-ink-soft";
}

/**
 * "Your journey" (MV-77 / MV-45 #3) — the cross-stage "where am I" rail on the
 * dashboard. Positions come from the pure buildJourney helper; every node's state
 * is a real signal, the frontier marks where you are, and skipped stages stay
 * honestly upcoming. The granular per-application detail lives in the MV-73 funnel.
 */
export function JourneyRail({ signals }: { signals: JourneySignals }) {
  const journey = buildJourney(signals);
  return (
    <Card as="section" aria-label="Your journey" padding="md" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-body font-medium text-ink">Your journey</h2>
        <p className="text-small text-ink-faint">Where you are on the path to studying in Australia.</p>
      </div>
      {/* One-line summary for screen readers, before the per-node detail. */}
      <p className="sr-only">{journey.ariaLabel}</p>
      <ol className="relative flex">
        {/* Baseline runs through the dot centres; hollow dots sit on bg-surface so
            the line doesn't show through their middle. */}
        <div aria-hidden className="absolute left-[8.33%] right-[8.33%] top-[13px] h-px bg-line" />
        {journey.stages.map((stage) => (
          <li key={stage.key} className="relative flex flex-1">
            <Link
              href={stage.href}
              aria-label={`${stage.label}: ${stage.word}${stage.current ? " — you are here" : ""}`}
              aria-current={stage.current ? "step" : undefined}
              className="flex flex-1 flex-col items-center gap-1.5 rounded-md px-1 py-1 transition-colors ease-calm hover:bg-bg-tint"
            >
              <span aria-hidden className={dotCls(stage)} />
              <span aria-hidden className={cn("text-center text-small", labelCls(stage))}>{stage.label}</span>
              <span
                aria-hidden
                className={cn("text-center font-mono text-caption uppercase tracking-wide", labelCls(stage))}
              >
                {stage.word}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
