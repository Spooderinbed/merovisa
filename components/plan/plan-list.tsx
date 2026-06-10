import type { PlanItemRow } from "@/lib/plan/types";
import { PlanItemCard } from "./plan-item-card";
import { groupOpenItems } from "@/lib/plan/select";

export function PlanList({ items }: { items: PlanItemRow[] }) {
  const closed = items.filter((i) => i.status !== "todo");
  // Shared grouping — the dashboard next-step selector ranks with the same brain.
  const { high, medium, low, visaPrep } = groupOpenItems(items);
  const rest = [...high, ...medium, ...low];

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

  const renderImpact = (label: string, list: PlanItemRow[]) =>
    list.length === 0 ? null : (
      <section className="flex flex-col gap-3">
        <h3 className="font-mono text-[12.5px] uppercase tracking-wide text-ink-faint">
          {label} ({list.length})
        </h3>
        <div className="flex flex-col gap-3">
          {list.map((i) => (
            <PlanItemCard key={i.id} item={i} />
          ))}
        </div>
      </section>
    );

  return (
    <div className="flex flex-col gap-8">
      {rest.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-medium text-ink">Your next steps</h2>
            <p className="text-[14px] text-ink-soft">Profile and case work, ranked by impact.</p>
          </div>
          <div className="flex flex-col gap-6">
            {renderImpact("High impact", high)}
            {renderImpact("Medium impact", medium)}
            {renderImpact("Low impact", low)}
          </div>
        </div>
      ) : null}

      {visaPrep.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-medium text-ink">Visa preparation</h2>
            <p className="text-[14px] text-ink-soft">Australia-specific visa steps, in the order to tackle them.</p>
          </div>
          <div className="flex flex-col gap-3">
            {visaPrep.map((i) => (
              <PlanItemCard key={i.id} item={i} />
            ))}
          </div>
        </div>
      ) : null}

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
