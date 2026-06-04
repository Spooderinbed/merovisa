"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (institution.trim()) patch.institution = institution.trim();
    if (degree) patch.degree = degree;
    if (gradePercent) patch.gradePercent = Number(gradePercent);
    if (gradeSystem.trim()) patch.gradeSystem = gradeSystem.trim();
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "academic", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ae-inst" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Institution</label>
        <input id="ae-inst" value={institution} onChange={(e) => setInstitution(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ae-degree" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Degree</label>
        <select id="ae-degree" value={degree} onChange={(e) => setDegree(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
          <option value="">Select a degree</option>
          {DEGREES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="ae-grade" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Grade percent</label>
          <input id="ae-grade" type="number" min={0} max={100} value={gradePercent} onChange={(e) => setGradePercent(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ae-system" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Grade system</label>
          <input id="ae-system" value={gradeSystem} onChange={(e) => setGradeSystem(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        {status === "saved" ? <span role="status" className="text-[14px] text-strong">Saved</span> : null}
        {status === "error" ? <span role="status" className="text-[14px] text-reach">Couldn&apos;t save — try again.</span> : null}
      </div>
    </form>
  );
}
