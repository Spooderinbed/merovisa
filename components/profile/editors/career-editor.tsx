"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveFeedback, useSectionSave } from "./section-save";

export interface CareerInitial {
  goal?:
    | "permanent-residency"
    | "lowest-cost"
    | "highest-ranked"
    | "fastest-admission"
    | "best-employment"
    | "research";
  targetRole?: string;
}

const GOALS = [
  { value: "permanent-residency", label: "Permanent residency" },
  { value: "best-employment", label: "Best employment" },
  { value: "highest-ranked", label: "Highest-ranked school" },
  { value: "lowest-cost", label: "Lowest cost" },
  { value: "fastest-admission", label: "Fastest admission" },
  { value: "research", label: "Research" },
];

export function CareerEditor({ initial }: { initial: CareerInitial }) {
  const [goal, setGoal] = useState<string>(initial.goal ?? "");
  const [targetRole, setTargetRole] = useState<string>(initial.targetRole ?? "");
  const { status, save } = useSectionSave("career");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (goal) patch.goal = goal;
    if (targetRole.trim()) patch.targetRole = targetRole.trim();
    await save(patch);
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ce-goal" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Career goal</label>
        <select id="ce-goal" value={goal} onChange={(e) => setGoal(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
          <option value="">Select a goal</option>
          {GOALS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ce-target-role" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Target role</label>
        <input id="ce-target-role" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
