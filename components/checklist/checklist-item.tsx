"use client";

import type { ChecklistItem as Item } from "@/lib/checklist/types";
import type { LinkedPlanState } from "@/lib/checklist/plan-links";
import { SourceLine } from "@/components/results/source-line";
import { track } from "@/lib/analytics/events";

const DOC_STATUS_LABEL: Record<"have" | "obtained" | "missing", string> = {
  have: "Have",
  obtained: "Marked obtained", // self-reported on the global checklist — distinct from an uploaded file
  missing: "Needed",
};
const INFO_CHIP: Record<NonNullable<Item["infoKind"]>, string> = { step: "Step", note: "Note" };
/** Mirrored from the linked plan item — the plan stays the only place that completes these. */
const PLAN_CHIP: Record<LinkedPlanState, string> = {
  open: "In your plan",
  "in-progress": "In progress",
  done: "Done",
};

export function ChecklistItem({ item, planState }: { item: Item; planState?: LinkedPlanState }) {
  const isDone = item.status === "have" || item.status === "obtained" || planState === "done";
  const chip = planState
    ? PLAN_CHIP[planState]
    : item.status === "info"
      ? INFO_CHIP[item.infoKind ?? "note"]
      : DOC_STATUS_LABEL[item.status];
  return (
    <li className={`flex flex-col gap-1 rounded-lg border p-3 ${isDone ? "border-primary bg-surface" : "border-line bg-bg-tint"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {isDone ? (
            <span
              aria-hidden
              className="grid size-4 shrink-0 place-items-center rounded-pill border border-primary bg-primary text-[10px] leading-none text-on-primary"
            >
              ✓
            </span>
          ) : null}
          <span className="text-[15px] text-ink">{item.label}</span>
        </span>
        <div className="flex items-center gap-2">
          {item.kind !== null && item.requirement === "recommended" && (
            <span className="rounded-pill border border-line px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-ink-faint">
              Recommended
            </span>
          )}
          <span className={`font-mono text-[11px] uppercase tracking-wide ${isDone ? "text-strong" : "text-ink-faint"}`}>
            {chip}
          </span>
        </div>
      </div>
      {item.note && <p className="text-[13px] text-ink-soft">{item.note}</p>}
      {item.source && <SourceLine url={item.source.url} lastVerified={item.source.lastVerified} surface="checklist" />}
      {(item.status === "missing" || item.status === "obtained") && item.kind && (
        <a href="/documents" className="text-[12.5px] text-primary hover:underline">Upload in documents ↗</a>
      )}
      {(planState === "open" || planState === "in-progress") && (
        <a
          href="/plan"
          className="text-[12.5px] text-primary hover:underline"
          onClick={() => track("checklist_plan_link_clicked", { key: item.key })}
        >
          Track in your plan →
        </a>
      )}
    </li>
  );
}
