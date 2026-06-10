"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveFeedback, useSectionSave } from "./section-save";

export interface GapInitial {
  years?: number;
  reasons?: string[];
  evidence?: string[];
}

const REASONS = [
  { value: "worked", label: "Worked" },
  { value: "retook-exams", label: "Retook exams" },
  { value: "health-family", label: "Health or family" },
  { value: "started-something", label: "Started something" },
  { value: "preparing", label: "Preparing to study" },
];

export function GapEditor({ initial }: { initial: GapInitial }) {
  const [years, setYears] = useState<string>(initial.years?.toString() ?? "");
  const [reasons, setReasons] = useState<Set<string>>(new Set(initial.reasons ?? []));
  const [evidence, setEvidence] = useState((initial.evidence ?? []).join(", "));
  const { status, save } = useSectionSave("gap");

  const toggleReason = (value: string) => {
    setReasons((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (years) patch.years = Number(years);
    if (reasons.size) patch.reasons = Array.from(reasons);
    const evs = evidence.split(",").map((s) => s.trim()).filter(Boolean);
    if (evs.length) patch.evidence = evs;
    await save(patch);
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ge-years" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Years of gap</label>
        <input id="ge-years" type="number" min={0} max={20} value={years} onChange={(e) => setYears(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Reasons</span>
        <div className="flex flex-col gap-2">
          {REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-[14px] text-ink">
              <input type="checkbox" checked={reasons.has(r.value)} onChange={() => toggleReason(r.value)} />
              {r.label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ge-evidence" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Evidence (comma separated)</label>
        <input id="ge-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
