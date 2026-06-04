"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface FamilyInitial {
  situation?: "alone" | "spouse" | "spouse-and-kids" | "other";
}

const SITUATIONS = [
  { value: "alone", label: "Travelling alone" },
  { value: "spouse", label: "With spouse" },
  { value: "spouse-and-kids", label: "Spouse + kids" },
  { value: "other", label: "Other" },
];

export function FamilyEditor({ initial }: { initial: FamilyInitial }) {
  const [situation, setSituation] = useState<string>(initial.situation ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (situation) patch.situation = situation;
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "family", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
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
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        {status === "saved" ? <span role="status" className="text-[14px] text-strong">Saved</span> : null}
        {status === "error" ? <span role="status" className="text-[14px] text-reach">Couldn&apos;t save — try again.</span> : null}
      </div>
    </form>
  );
}
