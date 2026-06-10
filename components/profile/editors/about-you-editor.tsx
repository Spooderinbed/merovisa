"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveFeedback, useGroupSave, type GroupSaveEntry } from "./section-save";

export interface AboutYouInitial {
  personal?: { name?: string; age?: number; intakeIso?: string };
  family?: { situation?: "alone" | "spouse" | "spouse-and-kids" | "other"; children?: number };
}

const SITUATIONS = [
  { value: "alone", label: "Travelling alone" },
  { value: "spouse", label: "With spouse" },
  { value: "spouse-and-kids", label: "Spouse + kids" },
  { value: "other", label: "Other" },
];

const MAX_CHILDREN = 10;

/**
 * "About you" group: personal (name, age) + family. The intake date stays
 * stored on personal.intakeIso but renders under Destination & intake.
 */
export function AboutYouEditor({ initial }: { initial: AboutYouInitial }) {
  const [name, setName] = useState(initial.personal?.name ?? "");
  const [age, setAge] = useState<string>(initial.personal?.age?.toString() ?? "");
  const [situation, setSituation] = useState<string>(initial.family?.situation ?? "");
  const [children, setChildren] = useState<number>(initial.family?.children ?? 1);
  const { status, saveSections } = useGroupSave();

  // The child count only matters when kids are declared; the situation gates it.
  const hasKids = situation === "spouse-and-kids";

  const buildPersonal = () => {
    const patch: Record<string, unknown> = {};
    if (name.trim()) patch.name = name.trim();
    if (age) patch.age = Number(age);
    return patch;
  };

  const buildFamily = () => {
    const patch: Record<string, unknown> = {};
    if (situation) patch.situation = situation;
    if (hasKids) patch.children = Math.min(MAX_CHILDREN, Math.max(1, children));
    return patch;
  };

  // Last-saved snapshot per member section; only sections that drifted from it
  // are PATCHed (the group save fans out one request per dirty section).
  const baseline = useRef({
    personal: JSON.stringify(buildPersonal()),
    family: JSON.stringify(buildFamily()),
  });

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const personal = buildPersonal();
    const family = buildFamily();
    const entries: GroupSaveEntry[] = [];
    if (JSON.stringify(personal) !== baseline.current.personal) entries.push({ section: "personal", patch: personal });
    if (JSON.stringify(family) !== baseline.current.family) entries.push({ section: "family", patch: family });
    if (await saveSections(entries)) {
      baseline.current = { personal: JSON.stringify(personal), family: JSON.stringify(family) };
    }
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="pe-name" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Name</label>
        <input id="pe-name" value={name} onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="pe-age" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Age</label>
        <input id="pe-age" type="number" value={age} onChange={(e) => setAge(e.target.value)} min={15} max={80}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="fme-situation" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Family situation</label>
          <select id="fme-situation" value={situation} onChange={(e) => setSituation(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
            <option value="">Select a situation</option>
            {SITUATIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        {hasKids ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="fme-children" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Number of children</label>
            <input id="fme-children" type="number" min={1} max={MAX_CHILDREN} value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
              className="w-24 rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
