"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveFeedback, useSectionSave } from "./section-save";

export interface WorkInitial {
  title?: string;
  years?: number;
  relevance?: string;
  docs?: boolean;
}

const RELEVANCE = [
  { value: "directly-related", label: "Directly related" },
  { value: "related", label: "Related" },
  { value: "unrelated", label: "Unrelated" },
];

export function WorkEditor({ initial }: { initial: WorkInitial }) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [years, setYears] = useState<string>(initial.years?.toString() ?? "");
  const [relevance, setRelevance] = useState(initial.relevance ?? "");
  const { status, save } = useSectionSave("work");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (title.trim()) patch.title = title.trim();
    if (years) patch.years = Number(years);
    if (relevance) patch.relevance = relevance;
    await save(patch);
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="we-title" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Title</label>
        <input id="we-title" value={title} onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="we-years" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Years</label>
          <input id="we-years" type="number" min={0} max={40} value={years} onChange={(e) => setYears(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="we-relevance" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Relevance</label>
          <select id="we-relevance" value={relevance} onChange={(e) => setRelevance(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
            <option value="">Select relevance</option>
            {RELEVANCE.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[13px] text-ink-soft">
        Have an employment letter? Upload it on the{" "}
        <a href="/documents" className="text-primary underline-offset-2 hover:underline">
          Documents page
        </a>{" "}
        to mark this as complete.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
