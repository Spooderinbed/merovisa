import type { ChecklistItem as Item } from "@/lib/checklist/types";
import { ChecklistItem } from "./checklist-item";

export interface ChecklistBlock {
  label: string;
  items: Item[];
}

export function ChecklistStageSection({ title, subtitle, blocks }: { title: string; subtitle: string; blocks: ChecklistBlock[] }) {
  const present = blocks.filter((b) => b.items.length > 0);
  if (present.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-medium text-ink">{title}</h2>
        <p className="text-[14px] text-ink-soft">{subtitle}</p>
      </div>
      {present.map((b) => (
        <div key={b.label} className="flex flex-col gap-2">
          <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">{b.label}</span>
          <ul className="flex flex-col gap-2">
            {b.items.map((i) => <ChecklistItem key={i.key} item={i} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}
