import type { ChecklistItem as Item } from "@/lib/checklist/types";
import type { LinkedPlanState } from "@/lib/checklist/plan-links";
import type { StageReadiness } from "@/lib/checklist/readiness";
import { ChecklistItem } from "./checklist-item";

export interface ChecklistBlock {
  label: string;
  items: Item[];
}

export function ChecklistStageSection({ title, subtitle, blocks, planStates, readiness }: { title: string; subtitle: string; blocks: ChecklistBlock[]; planStates?: Record<string, LinkedPlanState>; readiness?: StageReadiness }) {
  const present = blocks.filter((b) => b.items.length > 0);
  if (present.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-title font-medium text-ink">{title}</h2>
          {readiness && readiness.total > 0 && (
            <span className="whitespace-nowrap font-mono text-caption uppercase tracking-wide text-ink-faint">
              {readiness.ready} of {readiness.total} ready
            </span>
          )}
        </div>
        <p className="text-meta text-ink-soft">{subtitle}</p>
      </div>
      {present.map((b) => (
        <div key={b.label} className="flex flex-col gap-2">
          <span className="font-mono text-caption uppercase tracking-wide text-ink-faint">{b.label}</span>
          <ul className="flex flex-col gap-2">
            {b.items.map((i) => <ChecklistItem key={i.key} item={i} planState={planStates?.[i.key]} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}
