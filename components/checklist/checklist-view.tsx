import type { ChecklistItem } from "@/lib/checklist/types";
import type { LinkedPlanState } from "@/lib/checklist/plan-links";
import type { Program, University } from "@/lib/programs/types";
import { GROUP_LABELS, GROUPS } from "@/lib/documents/types";
import { ChecklistStageSection, type ChecklistBlock } from "./checklist-stage-section";

export function ChecklistView({ program, university, items, planStates }: { program: Program; university: University | null; items: ChecklistItem[]; planStates?: Record<string, LinkedPlanState> }) {
  const now = items.filter((i) => i.stage === "now");
  const later = items.filter((i) => i.stage === "after-offer");

  const nowBlocks: ChecklistBlock[] = GROUPS
    .filter((g) => now.some((i) => i.group === g))
    .map((g) => ({ label: GROUP_LABELS[g], items: now.filter((i) => i.group === g) }));

  const laterBlocks: ChecklistBlock[] = [
    { label: "Documents", items: later.filter((i) => i.kind !== null) },
    { label: "Visa lodgement steps", items: later.filter((i) => i.kind === null) },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
          Document checklist{university ? ` · ${university.name}` : ""}
        </span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">{program.name}</h1>
        <p className="max-w-[64ch] text-[16px] text-ink-soft">
          This checklist is your reference for everything this program requires. You work through
          and tick off these steps in your plan — your single action queue.
        </p>
      </header>
      <ChecklistStageSection title="What you need now" subtitle="Gather these to apply and to build your visa case." blocks={nowBlocks} planStates={planStates} />
      <ChecklistStageSection title="After your offer" subtitle="You'll add these once a university offers you a place." blocks={laterBlocks} planStates={planStates} />
    </div>
  );
}
