"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (refusals) patch.refusals = refusals;
    patch.travelled = travelled;
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "immigration", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ie-refusals" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Prior visa refusals</label>
        <select id="ie-refusals" value={refusals} onChange={(e) => setRefusals(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
          <option value="">Select an option</option>
          {REFUSALS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input type="checkbox" checked={travelled} onChange={(e) => setTravelled(e.target.checked)} />
        Have you travelled abroad before?
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        {status === "saved" ? <span role="status" className="text-[14px] text-strong">Saved</span> : null}
        {status === "error" ? <span role="status" className="text-[14px] text-reach">Couldn&apos;t save — try again.</span> : null}
      </div>
    </form>
  );
}
