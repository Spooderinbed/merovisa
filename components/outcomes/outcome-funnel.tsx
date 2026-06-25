import type { FunnelStage, OutcomeFunnelRow } from "@/lib/outcomes/funnel";
import { cn } from "@/lib/utils";
import { OutcomeSelfReport } from "./outcome-self-report";

const VERDICT_CHIP: Record<string, { label: string; cls: string }> = {
  strong: { label: "Strong match", cls: "bg-strong-tint text-strong" },
  possible: { label: "Possible", cls: "bg-possible-tint text-possible" },
  reach: { label: "Reach", cls: "bg-reach-tint text-reach" },
};

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

function OutcomeRow({ row }: { row: OutcomeFunnelRow }) {
  const verdict = VERDICT_CHIP[row.verdict];
  const stage = STAGE_META[row.stage];
  return (
    <article className="rounded-md border border-line bg-surface p-4">
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
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
        {verdict ? (
          <span className={cn("rounded-pill px-2 py-0.5 font-mono text-[11px]", verdict.cls)}>
            {verdict.label}
          </span>
        ) : null}
        {row.intake ? <span>Intake {row.intake}</span> : null}
        {row.lastUpdated ? <span>· Updated {updatedLabel(row.lastUpdated)}</span> : null}
      </div>
      <OutcomeSelfReport attemptId={row.attemptId} nextEvents={row.nextEvents} />
    </article>
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
