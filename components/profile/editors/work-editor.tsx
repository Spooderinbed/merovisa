"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
  const [docs, setDocs] = useState<boolean>(initial.docs ?? false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (title.trim()) patch.title = title.trim();
    if (years) patch.years = Number(years);
    if (relevance) patch.relevance = relevance;
    patch.docs = docs;
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "work", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
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
      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input type="checkbox" checked={docs} onChange={(e) => setDocs(e.target.checked)} />
        Reference letter or employment docs available
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        {status === "saved" ? <span role="status" className="text-[14px] text-strong">Saved</span> : null}
        {status === "error" ? <span role="status" className="text-[14px] text-reach">Couldn&apos;t save — try again.</span> : null}
      </div>
    </form>
  );
}
