"use client";

import type { EducationLevel } from "@/lib/scoring/types";
import { OptionCard } from "@/components/ui/option-card";
import { Slider } from "@/components/ui/slider";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

const LEVELS: Array<{ value: EducationLevel; label: string }> = [
  { value: "higher-secondary", label: "Higher secondary (+2)" },
  { value: "bachelors", label: "Bachelor's degree" },
  { value: "masters", label: "Master's degree" },
];

export function EducationStep({ profile, setField, callouts }: StepProps) {
  const grade = profile.grade ?? 70;
  return (
    <StepShell
      eyebrow="Step 2"
      title="Your education so far"
      subtext="Enter your result in your own grade system — we convert it for each destination."
      callouts={callouts}
    >
      {LEVELS.map((l) => (
        <OptionCard
          key={l.value}
          label={l.label}
          selected={profile.educationLevel === l.value}
          onSelect={() => setField({ educationLevel: l.value, grade: profile.grade ?? 70 })}
        />
      ))}
      <div className="mt-2 flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] text-ink-soft">Your grade</span>
          <span className="font-mono text-[15px] text-ink">{grade}%</span>
        </div>
        <Slider
          ariaLabel="Grade percentage"
          min={40}
          max={100}
          step={1}
          value={grade}
          onChange={(v) => setField({ grade: v })}
        />
      </div>
    </StepShell>
  );
}
