"use client";

import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

// MVP corridor is Nepal → Australia. Other source countries are shown as
// "coming soon" rather than scored, because the wizard collects a percentage
// grade and we do not yet model their native grade systems (CGPA, etc.).
const SUPPORTED_COUNTRY = "Nepal";
const COMING_SOON = ["India", "Bangladesh", "Pakistan", "Nigeria", "Other"];

export function HomeCountryStep({ profile, setField, callouts, eyebrow }: StepProps) {
  return (
    <StepShell
      eyebrow={eyebrow}
      title="Where are you applying from?"
      subtext="We're starting with Nepal — more countries are coming soon."
      callouts={callouts}
    >
      <div role="radiogroup" aria-label="Home country" className="flex flex-col gap-3">
        <OptionCard
          label={SUPPORTED_COUNTRY}
          selected={profile.homeCountry === SUPPORTED_COUNTRY}
          onSelect={() => setField({ homeCountry: SUPPORTED_COUNTRY, gradeSystem: "percentage-nepal" })}
        />
      </div>
      <p className="text-small text-ink-faint">More countries coming soon: {COMING_SOON.join(", ")}.</p>
    </StepShell>
  );
}
