"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface IntendedStudyInitial {
  level?: string;
  field?: string;
  specialisation?: string;
}

const LEVELS = [
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
  { value: "doctorate", label: "Doctorate" },
];

export function IntendedStudyEditor({ initial }: { initial: IntendedStudyInitial }) {
  const [level, setLevel] = useState(initial.level ?? "");
  const [field, setField] = useState(initial.field ?? "");
  const [specialisation, setSpecialisation] = useState(initial.specialisation ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (level) patch.level = level;
    if (field.trim()) patch.field = field.trim();
    if (specialisation.trim()) patch.specialisation = specialisation.trim();
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "intended-study", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ise-level" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Level</label>
        <select id="ise-level" value={level} onChange={(e) => setLevel(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
          <option value="">Select a level</option>
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ise-field" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Field</label>
        <input id="ise-field" value={field} onChange={(e) => setField(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ise-spec" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Specialisation</label>
        <input id="ise-spec" value={specialisation} onChange={(e) => setSpecialisation(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        {status === "saved" ? <span role="status" className="text-[14px] text-strong">Saved</span> : null}
        {status === "error" ? <span role="status" className="text-[14px] text-reach">Couldn&apos;t save — try again.</span> : null}
      </div>
    </form>
  );
}
