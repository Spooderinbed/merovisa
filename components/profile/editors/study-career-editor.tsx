"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveFeedback, useGroupSave, type GroupSaveEntry } from "./section-save";

export interface StudyCareerInitial {
  "intended-study"?: { level?: string; field?: string; specialisation?: string };
  career?: {
    goal?:
      | "permanent-residency"
      | "lowest-cost"
      | "highest-ranked"
      | "fastest-admission"
      | "best-employment"
      | "research";
    targetRole?: string;
  };
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

const GOALS = [
  { value: "permanent-residency", label: "Permanent residency" },
  { value: "best-employment", label: "Best employment" },
  { value: "highest-ranked", label: "Highest-ranked school" },
  { value: "lowest-cost", label: "Lowest cost" },
  { value: "fastest-admission", label: "Fastest admission" },
  { value: "research", label: "Research" },
];

/** "Study & career goals" group: intended-study + career. */
export function StudyCareerEditor({ initial }: { initial: StudyCareerInitial }) {
  const [level, setLevel] = useState(initial["intended-study"]?.level ?? "");
  const [field, setField] = useState(initial["intended-study"]?.field ?? "");
  const [specialisation, setSpecialisation] = useState(initial["intended-study"]?.specialisation ?? "");
  const [goal, setGoal] = useState<string>(initial.career?.goal ?? "");
  const [targetRole, setTargetRole] = useState<string>(initial.career?.targetRole ?? "");
  const { status, saveSections } = useGroupSave();

  const buildStudy = () => {
    const patch: Record<string, unknown> = {};
    if (level) patch.level = level;
    if (field) patch.field = field;
    if (specialisation.trim()) patch.specialisation = specialisation.trim();
    return patch;
  };

  const buildCareer = () => {
    const patch: Record<string, unknown> = {};
    if (goal) patch.goal = goal;
    if (targetRole.trim()) patch.targetRole = targetRole.trim();
    return patch;
  };

  const baseline = useRef({
    study: JSON.stringify(buildStudy()),
    career: JSON.stringify(buildCareer()),
  });

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const study = buildStudy();
    const career = buildCareer();
    const entries: GroupSaveEntry[] = [];
    if (JSON.stringify(study) !== baseline.current.study) entries.push({ section: "intended-study", patch: study });
    if (JSON.stringify(career) !== baseline.current.career) entries.push({ section: "career", patch: career });
    if (await saveSections(entries)) {
      baseline.current = { study: JSON.stringify(study), career: JSON.stringify(career) };
    }
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ise-level" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Level</label>
        <select id="ise-level" value={level} onChange={(e) => setLevel(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink focus:border-primary">
          <option value="">Select a level</option>
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ise-field" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Field</label>
        <select id="ise-field" value={field} onChange={(e) => setField(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink focus:border-primary">
          <option value="">Select a field</option>
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ise-spec" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Specialisation</label>
        <input id="ise-spec" value={specialisation} onChange={(e) => setSpecialisation(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink focus:border-primary" />
      </div>
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="ce-goal" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Career goal</label>
          <select id="ce-goal" value={goal} onChange={(e) => setGoal(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink focus:border-primary">
            <option value="">Select a goal</option>
            {GOALS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ce-target-role" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Target role</label>
          <input id="ce-target-role" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink focus:border-primary" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
