"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface PersonalInitial {
  name?: string;
  age?: number;
  intakeIso?: string;
}

export function PersonalEditor({ initial }: { initial: PersonalInitial }) {
  const [name, setName] = useState(initial.name ?? "");
  const [age, setAge] = useState<string>(initial.age?.toString() ?? "");
  const [intake, setIntake] = useState<string>(initial.intakeIso ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (name.trim()) patch.name = name.trim();
    if (age) patch.age = Number(age);
    if (intake) patch.intakeIso = intake;
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "personal", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="pe-name" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Name</label>
        <input id="pe-name" value={name} onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="pe-age" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Age</label>
          <input id="pe-age" type="number" value={age} onChange={(e) => setAge(e.target.value)} min={15} max={80}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="pe-intake" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Intake</label>
          <input id="pe-intake" type="date" value={intake} onChange={(e) => setIntake(e.target.value)}
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
