"use client";

import type { EducationLevel, GradeSystem } from "@/lib/scoring/types";
import { Card } from "@/components/ui/card";
import { OptionCard } from "@/components/ui/option-card";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { gradeFromPercentage, gradeScaleFor, gradeToPercentage } from "@/lib/scoring/grade-scale";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

const LEVELS: Array<{ value: EducationLevel; label: string }> = [
  { value: "higher-secondary", label: "Higher secondary (+2)" },
  { value: "bachelors", label: "Bachelor's degree" },
  { value: "masters", label: "Master's degree" },
];

const GRADE_SYSTEMS: Array<{ value: GradeSystem; label: string }> = [
  { value: "percentage-nepal", label: "Percentage" },
  { value: "cgpa-4", label: "GPA / 4.0" },
];

export function EducationStep({ profile, setField, callouts, eyebrow }: StepProps) {
  const system: GradeSystem = profile.gradeSystem === "cgpa-4" ? "cgpa-4" : "percentage-nepal";
  const grade = profile.grade ?? (system === "cgpa-4" ? gradeFromPercentage(70, "cgpa-4") : 70);
  const scale = gradeScaleFor(system);

  const handleSystemChange = (next: GradeSystem) => {
    const currentPercentage = gradeToPercentage(grade, system);
    setField({ gradeSystem: next, grade: gradeFromPercentage(currentPercentage, next) });
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title="Your education so far"
      subtext="Pick your level and set your grade — as a percentage or a GPA out of 4.0 — we compare it against each university's bar."
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
      <Segmented
        ariaLabel="Grade system"
        options={GRADE_SYSTEMS}
        value={system}
        onChange={handleSystemChange}
      />
      <Card radius="card" padding="sm" className="mt-2 flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-body text-ink-soft">Your grade</span>
          <span className="font-mono text-body text-ink">
            {system === "cgpa-4" ? `${grade.toFixed(1)} / 4.0` : `${Math.round(grade)}%`}
          </span>
        </div>
        {system === "cgpa-4" && (
          <div className="text-right text-small text-ink-faint">
            ≈ {Math.round(gradeToPercentage(grade, "cgpa-4"))}% equivalent
          </div>
        )}
        <Slider
          ariaLabel="Grade"
          min={scale.min}
          max={scale.max}
          step={scale.step}
          value={grade}
          onChange={(v) => setField({ grade: v })}
        />
      </Card>
    </StepShell>
  );
}
