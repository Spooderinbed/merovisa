import type { ChecklistItem as Item } from "@/lib/checklist/types";
import { GROUP_LABELS, GROUPS } from "@/lib/documents/types";
import { ChecklistItem } from "./checklist-item";

export function ChecklistStageSection({ title, subtitle, items }: { title: string; subtitle: string; items: Item[] }) {
  if (items.length === 0) return null;
  const groupsPresent = GROUPS.filter((g) => items.some((i) => i.group === g));
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-medium text-ink">{title}</h2>
        <p className="text-[14px] text-ink-soft">{subtitle}</p>
      </div>
      {groupsPresent.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">{GROUP_LABELS[g]}</span>
          <ul className="flex flex-col gap-2">
            {items.filter((i) => i.group === g).map((i) => <ChecklistItem key={i.key} item={i} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}
