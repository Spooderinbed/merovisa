import type { PlanItemRow } from "@/lib/plan/types";
import { PlanItemCard } from "./plan-item-card";

export function PlanList({ items }: { items: PlanItemRow[] }) {
  const open = items.filter((i) => i.status === "todo");
  const closed = items.filter((i) => i.status !== "todo");
  const high = open.filter((i) => i.impact === "high");
  const medium = open.filter((i) => i.impact === "medium");
  const low = open.filter((i) => i.impact === "low");

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6 text-center">
        <h2 className="text-[20px]">All caught up</h2>
        <p className="text-[15px] text-ink-soft">
          When you change your profile or rerun your assessment, new actions land here.
        </p>
      </div>
    );
  }

  const renderGroup = (label: string, list: PlanItemRow[]) =>
    list.length === 0 ? null : (
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[12.5px] uppercase tracking-wide text-ink-faint">
          {label} ({list.length})
        </h2>
        <div className="flex flex-col gap-3">
          {list.map((i) => (
            <PlanItemCard key={i.id} item={i} />
          ))}
        </div>
      </section>
    );

  return (
    <div className="flex flex-col gap-6">
      {renderGroup("High impact", high)}
      {renderGroup("Medium impact", medium)}
      {renderGroup("Low impact", low)}
      {closed.length > 0 ? (
        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="cursor-pointer font-mono text-[12.5px] uppercase tracking-wide text-ink-faint">
            Closed ({closed.length})
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {closed.map((i) => (
              <PlanItemCard key={i.id} item={i} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
