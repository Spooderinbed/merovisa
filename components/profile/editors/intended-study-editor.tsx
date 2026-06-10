"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveFeedback, useSectionSave } from "./section-save";

export interface IntendedStudyInitial {
  level?: string;
  field?: string;
  specialisation?: string;
}

const LEVELS = [
  { value: "higher-secondary", label: "Higher secondary" },
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
];

const FIELDS = [
  { value: "computer-science", label: "Computer science" },
  { value: "business", label: "Business" },
  { value: "nursing", label: "Nursing" },
  { value: "engineering", label: "Engineering" },
  { value: "hospitality", label: "Hospitality" },
  { value: "accounting", label: "Accounting" },
  { value: "data-science", label: "Data science" },
  { value: "education", label: "Education" },
  { value: "agriculture", label: "Agriculture" },
  { value: "law", label: "Law" },
  { value: "arts", label: "Arts" },
  { value: "other", label: "Other" },
];

export function IntendedStudyEditor({ initial }: { initial: IntendedStudyInitial }) {
  const [level, setLevel] = useState(initial.level ?? "");
  const [field, setField] = useState(initial.field ?? "");
  const [specialisation, setSpecialisation] = useState(initial.specialisation ?? "");
  const { status, save } = useSectionSave("intended-study");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (level) patch.level = level;
    if (field) patch.field = field;
    if (specialisation.trim()) patch.specialisation = specialisation.trim();
    await save(patch);
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
        <select id="ise-field" value={field} onChange={(e) => setField(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
          <option value="">Select a field</option>
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ise-spec" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Specialisation</label>
        <input id="ise-spec" value={specialisation} onChange={(e) => setSpecialisation(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
