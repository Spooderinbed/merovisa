"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveFeedback, useSectionSave } from "./section-save";

export interface DealBreakersInitial {
  mustHaves?: string[];
}

const OPTIONS = [
  { value: "pr-friendly", label: "PR-friendly" },
  { value: "work-rights", label: "Work rights during study" },
  { value: "dependants-allowed", label: "Dependants allowed" },
  { value: "affordable", label: "Affordable tuition" },
  { value: "english-only", label: "English-only programs" },
  { value: "regional-bonus", label: "Regional post-study bonus" },
];

export function DealBreakersEditor({ initial }: { initial: DealBreakersInitial }) {
  const [mustHaves, setMustHaves] = useState<Set<string>>(new Set(initial.mustHaves ?? []));
  const { status, save } = useSectionSave("deal-breakers");

  const toggle = (value: string) => {
    setMustHaves((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (mustHaves.size > 0) patch.mustHaves = Array.from(mustHaves);
    await save(patch);
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Must-haves</span>
        <div className="flex flex-col gap-2">
          {OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-[14px] text-ink">
              <input type="checkbox" checked={mustHaves.has(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
