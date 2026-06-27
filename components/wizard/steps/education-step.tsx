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

export function EducationStep({ profile, setField, callouts, eyebrow }: StepProps) {
  const grade = profile.grade ?? 70;
  return (
    <StepShell
      eyebrow={eyebrow}
      title="Your education so far"
      subtext="Pick your level and set your grade as a percentage — we compare it against each university's bar."
      callouts={callouts}
    >
      <div role="radiogroup" aria-label="Education level" className="flex flex-col gap-3">
        {LEVELS.map((l) => (
          <OptionCard
            key={l.value}
            label={l.label}
            selected={profile.educationLevel === l.value}
            onSelect={() => setField({ educationLevel: l.value, grade: profile.grade ?? 70 })}
          />
        ))}
      </div>
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
