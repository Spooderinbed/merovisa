"use client";

import { useState } from "react";
import { GRADE_SYSTEMS } from "@/lib/scoring/types";
import { humanize } from "@/lib/text/humanize";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { SaveFeedback, useSectionSave } from "./section-save";

export interface AcademicInitial {
  institution?: string;
  degree?: string;
  gradePercent?: number;
  gradeSystem?: string;
}

const DEGREES = [
  { value: "higher-secondary", label: "Higher secondary" },
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
];

export function AcademicEditor({ initial }: { initial: AcademicInitial }) {
  const [institution, setInstitution] = useState(initial.institution ?? "");
  const [degree, setDegree] = useState(initial.degree ?? "");
  const [gradePercent, setGradePercent] = useState<string>(initial.gradePercent?.toString() ?? "");
  const [gradeSystem, setGradeSystem] = useState(initial.gradeSystem ?? "");
  const { status, save } = useSectionSave("academic");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (institution.trim()) patch.institution = institution.trim();
    if (degree) patch.degree = degree;
    if (gradePercent) patch.gradePercent = Number(gradePercent);
    if (gradeSystem) patch.gradeSystem = gradeSystem;
    await save(patch);
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ae-inst" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Institution</label>
        <Input id="ae-inst" value={institution} onChange={(e) => setInstitution(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ae-degree" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Degree</label>
        <Select id="ae-degree" value={degree} onChange={(e) => setDegree(e.target.value)}>
          <option value="">Select a degree</option>
          {DEGREES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="ae-grade" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Grade percent</label>
          <Input id="ae-grade" type="number" min={0} max={100} value={gradePercent} onChange={(e) => setGradePercent(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ae-system" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Grade system</label>
          <Select id="ae-system" value={gradeSystem} onChange={(e) => setGradeSystem(e.target.value)}>
            <option value="">Select a system</option>
            {GRADE_SYSTEMS.map((g) => (
              <option key={g} value={g}>{humanize(g)}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
