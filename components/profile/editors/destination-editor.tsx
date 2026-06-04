"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface DestinationInitial {
  primary?: string;
  alternates?: string[];
}

const DESTINATIONS = [
  { value: "australia", label: "Australia" },
  { value: "canada", label: "Canada" },
  { value: "uk", label: "United Kingdom" },
  { value: "germany", label: "Germany" },
  { value: "us", label: "United States" },
  { value: "ireland", label: "Ireland" },
];

export function DestinationEditor({ initial }: { initial: DestinationInitial }) {
  const [primary, setPrimary] = useState(initial.primary ?? "");
  const [alternates, setAlternates] = useState((initial.alternates ?? []).join(", "));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (primary) patch.primary = primary;
    const alts = alternates.split(",").map((s) => s.trim()).filter(Boolean);
    if (alts.length) patch.alternates = alts;
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "destination", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="de-primary" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Primary destination</label>
        <select id="de-primary" value={primary} onChange={(e) => setPrimary(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
          <option value="">Select a destination</option>
          {DESTINATIONS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="de-alts" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Alternates (comma separated)</label>
        <input id="de-alts" value={alternates} onChange={(e) => setAlternates(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        {status === "saved" ? <span role="status" className="text-[14px] text-strong">Saved</span> : null}
        {status === "error" ? <span role="status" className="text-[14px] text-reach">Couldn&apos;t save — try again.</span> : null}
      </div>
    </form>
  );
}
