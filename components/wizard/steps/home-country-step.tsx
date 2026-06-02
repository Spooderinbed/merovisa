"use client";

import type { GradeSystem } from "@/lib/scoring/types";
import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

const COUNTRIES: Array<{ name: string; gradeSystem: GradeSystem }> = [
  { name: "Nepal", gradeSystem: "percentage-nepal" },
  { name: "India", gradeSystem: "percentage-india" },
  { name: "Bangladesh", gradeSystem: "cgpa-5" },
  { name: "Pakistan", gradeSystem: "percentage" },
  { name: "Nigeria", gradeSystem: "cgpa-5" },
  { name: "Other", gradeSystem: "percentage" },
];

export function HomeCountryStep({ profile, setField, callouts }: StepProps) {
  return (
    <StepShell
      eyebrow="Step 1"
      title="Where are you applying from?"
      subtext="This sets your grade scale and which visa rules we show you."
      callouts={callouts}
    >
      {COUNTRIES.map((c) => (
        <OptionCard
          key={c.name}
          label={c.name}
          selected={profile.homeCountry === c.name}
          onSelect={() => setField({ homeCountry: c.name, gradeSystem: c.gradeSystem })}
        />
      ))}
    </StepShell>
  );
}
