"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveFeedback, useSectionSave } from "./section-save";

export interface FamilyInitial {
  situation?: "alone" | "spouse" | "spouse-and-kids" | "other";
  children?: number;
}

const SITUATIONS = [
  { value: "alone", label: "Travelling alone" },
  { value: "spouse", label: "With spouse" },
  { value: "spouse-and-kids", label: "Spouse + kids" },
  { value: "other", label: "Other" },
];

const MAX_CHILDREN = 10;

export function FamilyEditor({ initial }: { initial: FamilyInitial }) {
  const [situation, setSituation] = useState<string>(initial.situation ?? "");
  const [children, setChildren] = useState<number>(initial.children ?? 1);
  const { status, save } = useSectionSave("family");

  // The child count only matters when kids are declared; the situation gates it.
  const hasKids = situation === "spouse-and-kids";

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (situation) patch.situation = situation;
    if (hasKids) patch.children = Math.min(MAX_CHILDREN, Math.max(1, children));
    await save(patch);
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
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
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
