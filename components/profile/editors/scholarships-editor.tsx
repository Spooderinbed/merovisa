"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveFeedback, useSectionSave } from "./section-save";

export interface ScholarshipsInitial {
  profile?: string[];
}

export function ScholarshipsEditor({ initial }: { initial: ScholarshipsInitial }) {
  const [profile, setProfile] = useState<string>((initial.profile ?? []).join(", "));
  const { status, save } = useSectionSave("scholarships");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    const tags = profile.split(",").map((s) => s.trim()).filter(Boolean);
    if (tags.length) patch.profile = tags;
    await save(patch);
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
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}
