"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface ScholarshipsInitial {
  profile?: string[];
}

export function ScholarshipsEditor({ initial }: { initial: ScholarshipsInitial }) {
  const [profile, setProfile] = useState<string>((initial.profile ?? []).join(", "));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    const tags = profile.split(",").map((s) => s.trim()).filter(Boolean);
    if (tags.length) patch.profile = tags;
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "scholarships", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="se-profile" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Scholarship profile (comma separated)</label>
        <input id="se-profile" value={profile} onChange={(e) => setProfile(e.target.value)}
          placeholder="merit, minority, regional"
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        <span className="text-[12px] text-ink-soft">Tags help match you to scholarship opportunities.</span>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        {status === "saved" ? <span role="status" className="text-[14px] text-strong">Saved</span> : null}
        {status === "error" ? <span role="status" className="text-[14px] text-reach">Couldn&apos;t save — try again.</span> : null}
      </div>
    </form>
  );
}
