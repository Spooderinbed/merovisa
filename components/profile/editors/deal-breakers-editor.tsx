"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface DealBreakersInitial {
  mustHaves?: string[];
}

const OPTIONS = [
  { value: "pr-friendly", label: "PR-friendly" },
  { value: "work-rights", label: "Work rights during study" },
  { value: "dependants-allowed", label: "Dependants allowed" },
  { value: "affordable", label: "Affordable tuition" },
  { value: "english-only", label: "English-only programs" },
  { value: "regional-bonus", label: "Regional post-study bonus" },
];

export function DealBreakersEditor({ initial }: { initial: DealBreakersInitial }) {
  const [mustHaves, setMustHaves] = useState<Set<string>>(new Set(initial.mustHaves ?? []));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const toggle = (value: string) => {
    setMustHaves((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (mustHaves.size > 0) patch.mustHaves = Array.from(mustHaves);
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "deal-breakers", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Must-haves</span>
        <div className="flex flex-col gap-2">
          {OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-[14px] text-ink">
              <input type="checkbox" checked={mustHaves.has(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
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
