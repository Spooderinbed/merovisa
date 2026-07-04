"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { SaveFeedback, useGroupSave, type GroupSaveEntry } from "./section-save";
import {
  reconcileAlsoConsidering,
  toggleAlsoConsidering,
  ALSO_CONSIDERING_CAP,
} from "@/lib/wizard/also-considering";
import type { FieldOfStudy } from "@/lib/scoring/types";

export interface StudyCareerInitial {
  "intended-study"?: { level?: string; field?: string; alsoConsidering?: string[]; specialisation?: string };
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

/**
 * Assemble the intended-study PATCH from editor state. `alsoConsidering` is ALWAYS
 * sent (an empty array when none) — the API shallow-merges the patch onto the stored
 * section (lib/profiles/repo.ts), so an omitted key would never clear extras the
 * student just removed, leaving stale per-field verdicts (MV-102 M1). The other
 * fields stay omit-when-empty (their absence is not a clear signal here).
 */
export function buildIntendedStudyPatch(state: {
  level: string;
  field: string;
  alsoConsidering: string[];
  specialisation: string;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = { alsoConsidering: state.alsoConsidering };
  if (state.level) patch.level = state.level;
  if (state.field) patch.field = state.field;
  if (state.specialisation.trim()) patch.specialisation = state.specialisation.trim();
  return patch;
}

/** "Study & career goals" group: intended-study + career. */
export function StudyCareerEditor({ initial }: { initial: StudyCareerInitial }) {
  const [level, setLevel] = useState(initial["intended-study"]?.level ?? "");
  const [field, setField] = useState(initial["intended-study"]?.field ?? "");
  const [alsoConsidering, setAlsoConsidering] = useState<string[]>(
    initial["intended-study"]?.alsoConsidering ?? [],
  );
  const [specialisation, setSpecialisation] = useState(initial["intended-study"]?.specialisation ?? "");
  const [goal, setGoal] = useState<string>(initial.career?.goal ?? "");
  const [targetRole, setTargetRole] = useState<string>(initial.career?.targetRole ?? "");
  const { status, saveSections } = useGroupSave();

  // Changing the primary keeps the two selections disjoint (drops the new primary
  // from the extras).
  const chooseField = (next: string) => {
    setField(next);
    setAlsoConsidering(reconcileAlsoConsidering(next as FieldOfStudy, alsoConsidering as FieldOfStudy[]));
  };
  const toggleExtra = (value: string) =>
    setAlsoConsidering(
      toggleAlsoConsidering(alsoConsidering as FieldOfStudy[], value as FieldOfStudy, field as FieldOfStudy),
    );

  const buildStudy = () => buildIntendedStudyPatch({ level, field, alsoConsidering, specialisation });

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
        <Select id="ise-level" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Select a level</option>
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ise-field" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Field</label>
        <Select id="ise-field" value={field} onChange={(e) => chooseField(e.target.value)}>
          <option value="">Select a field</option>
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </Select>
      </div>
      {field ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
            Also considering (optional — up to {ALSO_CONSIDERING_CAP})
          </legend>
          <div className="flex flex-wrap gap-2">
            {FIELDS.filter((f) => f.value !== field).map((f) => {
              const selected = alsoConsidering.includes(f.value);
              const atCap = alsoConsidering.length >= ALSO_CONSIDERING_CAP;
              return (
                <label
                  key={f.value}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-pill border px-3 py-1 text-[14px] ${
                    selected ? "border-primary bg-primary-tint text-ink" : "border-line-2 text-ink-soft"
                  } ${!selected && atCap ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selected}
                    disabled={!selected && atCap}
                    onChange={() => toggleExtra(f.value)}
                  />
                  {f.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-2">
        <label htmlFor="ise-spec" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Specialisation</label>
        <Input id="ise-spec" value={specialisation} onChange={(e) => setSpecialisation(e.target.value)} />
      </div>
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="ce-goal" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Career goal</label>
          <Select id="ce-goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="">Select a goal</option>
            {GOALS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ce-target-role" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Target role</label>
          <Input id="ce-target-role" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
