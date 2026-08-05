"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { SaveFeedback, useSectionSave } from "./section-save";

export interface ImmigrationInitial {
  refusals?: "none" | "one" | "multiple";
  travelled?: boolean;
}

const REFUSALS = [
  { value: "none", label: "None" },
  { value: "one", label: "One" },
  { value: "multiple", label: "Multiple" },
];

export function ImmigrationEditor({ initial }: { initial: ImmigrationInitial }) {
  const [refusals, setRefusals] = useState<string>(initial.refusals ?? "");
  const [travelled, setTravelled] = useState<boolean>(initial.travelled ?? false);
  const { status, save } = useSectionSave("immigration");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (refusals) patch.refusals = refusals;
    patch.travelled = travelled;
    await save(patch);
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ie-refusals" className="text-caption uppercase tracking-wide text-ink-faint">Prior visa refusals</label>
        <Select id="ie-refusals" value={refusals} onChange={(e) => setRefusals(e.target.value)}>
          <option value="">Select an option</option>
          {REFUSALS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-meta text-ink">
        <input type="checkbox" checked={travelled} onChange={(e) => setTravelled(e.target.checked)} />
        Have you travelled abroad before?
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
