"use client";

import { FIELDS_OF_STUDY_DATA } from "@/lib/data/fields-of-study";
import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

export function FieldOfStudyStep({ profile, setField, callouts }: StepProps) {
  return (
    <StepShell
      eyebrow="Step 4"
      title="What do you want to study?"
      subtext="This affects which universities, fee ranges, and visa categories apply to you."
      callouts={callouts}
    >
      <div role="radiogroup" aria-label="Field of study" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS_OF_STUDY_DATA.map((f) => (
          <OptionCard
            key={f.id}
            label={f.label}
            selected={profile.fieldOfStudy === f.id}
            onSelect={() => setField({ fieldOfStudy: f.id })}
          />
        ))}
      </div>
    </StepShell>
  );
}
