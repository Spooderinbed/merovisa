"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipInput } from "./chip-input";
import { SaveFeedback, useGroupSave, type GroupSaveEntry } from "./section-save";

export interface WorkGapInitial {
  work?: { title?: string; years?: number; relevance?: string; docs?: boolean };
  gap?: { years?: number; reasons?: string[]; evidence?: string[] };
}

const RELEVANCE = [
  { value: "directly-related", label: "Directly related" },
  { value: "related", label: "Related" },
  { value: "unrelated", label: "Unrelated" },
];

const REASONS = [
  { value: "worked", label: "Worked" },
  { value: "retook-exams", label: "Retook exams" },
  { value: "health-family", label: "Health or family" },
  { value: "started-something", label: "Started something" },
  { value: "preparing", label: "Preparing to study" },
];

/** "Work & study gap" group: work + gap. Gap evidence is a chip input. */
export function WorkGapEditor({ initial }: { initial: WorkGapInitial }) {
  const [title, setTitle] = useState(initial.work?.title ?? "");
  const [workYears, setWorkYears] = useState<string>(initial.work?.years?.toString() ?? "");
  const [relevance, setRelevance] = useState(initial.work?.relevance ?? "");
  const [gapYears, setGapYears] = useState<string>(initial.gap?.years?.toString() ?? "");
  const [reasons, setReasons] = useState<Set<string>>(new Set(initial.gap?.reasons ?? []));
  const [evidence, setEvidence] = useState<string[]>(initial.gap?.evidence ?? []);
  const { status, saveSections } = useGroupSave();

  const toggleReason = (value: string) => {
    setReasons((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const buildWork = () => {
    const patch: Record<string, unknown> = {};
    if (title.trim()) patch.title = title.trim();
    if (workYears) patch.years = Number(workYears);
    if (relevance) patch.relevance = relevance;
    return patch;
  };

  const buildGap = () => {
    const patch: Record<string, unknown> = {};
    if (gapYears) patch.years = Number(gapYears);
    if (reasons.size) patch.reasons = Array.from(reasons);
    if (evidence.length) patch.evidence = evidence;
    return patch;
  };

  const baseline = useRef({
    work: JSON.stringify(buildWork()),
    gap: JSON.stringify(buildGap()),
  });

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const work = buildWork();
    const gap = buildGap();
    const entries: GroupSaveEntry[] = [];
    if (JSON.stringify(work) !== baseline.current.work) entries.push({ section: "work", patch: work });
    if (JSON.stringify(gap) !== baseline.current.gap) entries.push({ section: "gap", patch: gap });
    if (await saveSections(entries)) {
      baseline.current = { work: JSON.stringify(work), gap: JSON.stringify(gap) };
    }
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
          <input id="we-years" type="number" min={0} max={40} value={workYears} onChange={(e) => setWorkYears(e.target.value)}
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
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="ge-years" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Years of gap</label>
          <input id="ge-years" type="number" min={0} max={20} value={gapYears} onChange={(e) => setGapYears(e.target.value)}
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
          <label htmlFor="ge-evidence" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Evidence</label>
          <ChipInput id="ge-evidence" value={evidence} onChange={setEvidence}
            placeholder="e.g. pay slips, experience letter" />
          <span className="text-[12px] text-ink-soft">Documents that back up the gap. Press Enter to add each one.</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
