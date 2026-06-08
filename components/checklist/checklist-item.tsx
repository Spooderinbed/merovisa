import type { ChecklistItem as Item } from "@/lib/checklist/types";
import { SourceLine } from "@/components/results/source-line";

const DOC_STATUS_LABEL: Record<"have" | "missing", string> = { have: "Have", missing: "Needed" };
const INFO_CHIP: Record<NonNullable<Item["infoKind"]>, string> = { step: "Step", note: "Note" };

export function ChecklistItem({ item }: { item: Item }) {
  const isHave = item.status === "have";
  const chip = item.status === "info" ? INFO_CHIP[item.infoKind ?? "note"] : DOC_STATUS_LABEL[item.status];
  return (
    <li className={`flex flex-col gap-1 rounded-lg border p-3 ${isHave ? "border-primary bg-surface" : "border-line bg-bg-tint"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] text-ink">{isHave ? "✓ " : ""}{item.label}</span>
        <div className="flex items-center gap-2">
          {item.kind !== null && item.requirement === "recommended" && (
            <span className="rounded-pill border border-line px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-ink-faint">
              Recommended
            </span>
          )}
          <span className={`font-mono text-[11px] uppercase tracking-wide ${isHave ? "text-strong" : "text-ink-faint"}`}>
            {chip}
          </span>
        </div>
      </div>
      {item.note && <p className="text-[13px] text-ink-soft">{item.note}</p>}
      {item.source && <SourceLine url={item.source.url} lastVerified={item.source.lastVerified} />}
      {item.status === "missing" && item.kind && (
        <a href="/documents" className="text-[12.5px] text-primary hover:underline">Upload in documents ↗</a>
      )}
    </li>
  );
}
