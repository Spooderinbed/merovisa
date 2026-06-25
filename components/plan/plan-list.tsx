import type { PlanItemRow } from "@/lib/plan/types";
import { PlanItemCard } from "./plan-item-card";
import { groupByPhase } from "@/lib/plan/select";

export function PlanList({
  items,
  onChanged,
}: {
  items: PlanItemRow[];
  /** Fires after any successful item action so the caller can re-fetch server data. */
  onChanged?: () => void;
}) {
  const closed = items.filter((i) => i.status !== "todo");
  // Phase-grouped journey — the dashboard next-step selector ranks with the same brain.
  const phases = groupByPhase(items);

  const intro = (
    <p className="max-w-[64ch] text-[14px] text-ink-soft">
      This is your guided plan — the steps to studying in Australia, in the order to tackle
      them. Each program&apos;s checklist is the full requirement reference behind it.
    </p>
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {intro}
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6 text-center">
          <h2 className="text-[20px]">All caught up</h2>
          <p className="text-[15px] text-ink-soft">
            When you change your profile or rerun your assessment, new actions land here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {intro}
      {phases.map(({ phase, items: phaseItems }) => (
        <section key={phase.id} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-medium text-ink">{phase.title}</h2>
            <p className="text-[14px] text-ink-soft">{phase.blurb}</p>
          </div>
          <div className="flex flex-col gap-3">
            {phaseItems.map((i) => (
              <PlanItemCard key={i.id} item={i} onChanged={onChanged} />
            ))}
          </div>
        </section>
      ))}

      {closed.length > 0 ? (
        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="cursor-pointer font-mono text-[12.5px] uppercase tracking-wide text-ink-faint">
            Closed ({closed.length})
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {closed.map((i) => (
              <PlanItemCard key={i.id} item={i} onChanged={onChanged} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
