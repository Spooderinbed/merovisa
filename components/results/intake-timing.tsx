import type { IntakeTiming, IntakeTimelinePoint } from "@/lib/timing/intake";
import { buildIntakeTimeline } from "@/lib/timing/intake";
import { Card } from "@/components/ui/card";

const STATUS_CLS = {
  open: "text-strong",
  tight: "text-possible",
  closed: "text-reach",
} as const;

// Dot fill mirrors the verdict palette: on-track / tight / closed.
const TICK_CLS = {
  open: "bg-strong",
  tight: "bg-possible",
  closed: "bg-reach",
} as const;

export function IntakeTimingCard({
  intake,
  timeline: timelineProp,
}: {
  intake: IntakeTiming;
  /** Server-computed timeline points (MV-118 #11): passed on the SSR /assessment/[id]
   *  route so the client renders identical offsets instead of recomputing left:% from
   *  its own clock/timezone (a hydration mismatch). The client-only fresh flow omits it. */
  timeline?: IntakeTimelinePoint[];
}) {
  // Fall back to a client-side compute only on the client-only fresh flow (no SSR).
  const timeline = timelineProp ?? buildIntakeTimeline(intake);
  return (
    <Card as="section" padding="lg">
      <span className="font-mono text-caption uppercase tracking-wide text-ink-faint">Intake timing</span>
      {/* A calendar-proportioned tick-timeline: `now` anchors the start, intake ticks
          sit at their real distance ahead, coloured by how open the window is. The
          nearest + alternatives text below carries the same intakes accessibly, so the
          visual is aria-hidden to avoid duplicate screen-reader output. */}
      <div className="mt-5" aria-hidden="true" data-testid="intake-timeline">
        <div className="relative mx-6 h-12">
          <div className="absolute inset-x-0 top-4 h-px bg-line" />
          <div className="absolute top-2 flex -translate-x-1/2 flex-col items-center" style={{ left: "0%" }}>
            <span className="block h-4 w-px bg-ink-faint" />
            <span className="mt-1 font-mono text-caption uppercase tracking-wide text-ink-faint">Now</span>
          </div>
          {timeline.map((p) => (
            <div
              key={`${p.name}-${p.year}`}
              className="absolute top-[11px] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${p.offsetPct}%` }}
              title={p.note}
            >
              <span className={`block h-2.5 w-2.5 rounded-full ${TICK_CLS[p.status]}`} />
              <span className="mt-1 whitespace-nowrap font-mono text-caption uppercase tracking-wide text-ink-soft">
                {p.name.slice(0, 3)} {p.year}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-6 text-title text-ink">
        Nearest realistic intake:{" "}
        <span className="font-medium">
          {intake.nearest.name} {intake.nearest.year}
        </span>
      </p>
      <p className={`mt-1 text-body ${STATUS_CLS[intake.nearest.status]}`}>{intake.nearest.note}</p>
      {intake.alternatives.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          {intake.alternatives.map((o, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-body">
              <span className="text-ink-soft">
                {o.name} {o.year}
              </span>
              <span className={STATUS_CLS[o.status]}>{o.note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
