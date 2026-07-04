import type { FunnelStage, OutcomeFunnelRow, RailStep } from "@/lib/outcomes/funnel";
import { buildOutcomeRail } from "@/lib/outcomes/funnel";
import type { EventType } from "@/lib/outcomes/types";
import { VERDICTS, type Verdict } from "@/lib/scoring/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { VerdictPill } from "@/components/ui/verdict-pill";
import { OutcomeSelfReport } from "./outcome-self-report";

// A row's frozen verdict comes back from the DB as a plain string; render the chip
// only for a recognised verdict (an unknown value renders nothing, never a crash).
function isVerdict(value: string): value is Verdict {
  return (VERDICTS as readonly string[]).includes(value);
}

const STAGE_META: Record<FunnelStage, { label: string; cls: string }> = {
  applied: { label: "Applied", cls: "border border-line text-ink-soft" },
  offer: { label: "Offer received", cls: "bg-strong-tint text-strong" },
  accepted: { label: "Offer accepted", cls: "bg-strong-tint text-strong" },
  rejected: { label: "Not successful", cls: "bg-reach-tint text-reach" },
  visa_lodged: { label: "Visa lodged", cls: "bg-possible-tint text-possible" },
  visa_granted: { label: "Visa granted", cls: "bg-strong-tint text-strong" },
  visa_refused: { label: "Visa refused", cls: "bg-reach-tint text-reach" },
  enrolled: { label: "Enrolled", cls: "bg-strong-tint text-strong" },
  withdrawn: { label: "Withdrawn", cls: "border border-line text-ink-faint" },
};

function updatedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Calm flat dots — reached steps fill teal, the current step adds a thin ring, and
// a stopped journey's exit dot is a hollow ring (red for rejection/refusal, grey
// for a withdrawal). Shape + label carry the state, never colour alone.
function railDotCls(step: RailStep): string {
  if (step.state === "exit") {
    return step.tone === "reach" ? "border-2 border-reach bg-surface" : "border-2 border-ink-faint bg-surface";
  }
  if (step.state === "passed") return "bg-strong border border-strong";
  if (step.state === "current") return "bg-strong ring-2 ring-strong/30";
  return "border border-line bg-surface"; // upcoming
}

function railLabelCls(step: RailStep): string {
  if (step.state === "exit") return step.tone === "reach" ? "text-reach" : "text-ink-faint";
  if (step.state === "upcoming") return "text-ink-faint";
  return "text-ink-soft";
}

/**
 * The journey rail (MV-73): a four-step Applied → Offer → Visa lodged → Granted
 * track per attempt. Positions come from the pure rail helper; a stopped journey
 * halts at an honest exit marker rather than ever lighting an unreached Granted.
 */
function OutcomeRailView({ events }: { events: EventType[] }) {
  const rail = buildOutcomeRail(events);
  return (
    <div role="group" aria-label={rail.ariaLabel} data-testid="outcome-rail" className="relative mt-3">
      {/* Baseline runs through the dot centres (first → last); hollow dots sit on
          bg-surface so the line doesn't show through their middle. */}
      <div aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[5px] h-px bg-line" />
      <div className="relative flex">
        {rail.steps.map((step) => (
          <div key={step.key} className="flex flex-1 flex-col items-center gap-1.5">
            <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", railDotCls(step))} />
            <span className={cn("text-center font-mono text-[10px] uppercase tracking-wide", railLabelCls(step))}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutcomeRow({ row }: { row: OutcomeFunnelRow }) {
  const stage = STAGE_META[row.stage];
  return (
    <Card as="article" radius="card" padding="sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          {row.universityName ? (
            <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
              {row.universityName}
            </span>
          ) : null}
          <span className="text-ink">{row.programName}</span>
        </div>
        <span className={cn("shrink-0 rounded-pill px-2.5 py-0.5 font-mono text-[11.5px]", stage.cls)}>
          {stage.label}
        </span>
      </div>
      <OutcomeRailView events={row.events} />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
        {isVerdict(row.verdict) ? <VerdictPill verdict={row.verdict} size="sm" /> : null}
        {row.intake ? <span>Intake {row.intake}</span> : null}
        {row.lastUpdated ? <span>· Updated {updatedLabel(row.lastUpdated)}</span> : null}
      </div>
      <OutcomeSelfReport attemptId={row.attemptId} nextEvents={row.nextEvents} />
    </Card>
  );
}

/**
 * The signed-in user's own outcome loop — one row per application attempt, showing
 * the frozen verdict against the live funnel stage (applied → offer → visa). Render
 * only when there is at least one attempt; an empty tracker reads as fake on a
 * trust-first product, so the dashboard omits this section entirely when empty.
 */
export function OutcomeFunnel({ rows }: { rows: OutcomeFunnelRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-medium text-ink">Your applications</h2>
        <p className="text-[14px] text-ink-soft">
          The programs you&rsquo;ve applied to, shown against the verdict we gave you. We&rsquo;ll add
          your offer and visa results as you report them.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <OutcomeRow key={row.attemptId} row={row} />
        ))}
      </div>
    </section>
  );
}
