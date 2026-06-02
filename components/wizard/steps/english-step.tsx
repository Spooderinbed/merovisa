"use client";

import type { EnglishStatus } from "@/lib/scoring/types";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

const STATUSES = [
  { value: "not-taken" as EnglishStatus, label: "Not taken" },
  { value: "booked" as EnglishStatus, label: "Booked" },
  { value: "taken" as EnglishStatus, label: "Taken" },
];

export function EnglishStep({ profile, setField, callouts }: StepProps) {
  const status = profile.englishStatus;
  const score = profile.englishScore ?? 6.5;
  const onStatus = (next: EnglishStatus) => {
    if (next === "taken") setField({ englishStatus: "taken", englishScore: profile.englishScore ?? 6.5 });
    else setField({ englishStatus: next, englishScore: undefined });
  };
  return (
    <StepShell
      eyebrow="Step 6"
      title="Where are you with English?"
      subtext="Most destinations need proof of English. Even a planned test helps us tailor your matches."
      callouts={callouts}
    >
      <Segmented ariaLabel="English status" options={STATUSES} value={status} onChange={onStatus} />
      {status === "taken" ? (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] text-ink-soft">IELTS band</span>
            <span className="font-mono text-[15px] text-ink">{score.toFixed(1)}</span>
          </div>
          <Slider
            ariaLabel="IELTS band"
            min={4}
            max={9}
            step={0.5}
            value={score}
            onChange={(v) => setField({ englishScore: v })}
          />
        </div>
      ) : null}
    </StepShell>
  );
}
