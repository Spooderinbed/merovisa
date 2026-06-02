"use client";

import type { Destination } from "@/lib/scoring/types";
import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

const DESTINATIONS: Array<{ value: Destination; label: string }> = [
  { value: "australia", label: "Australia" },
  { value: "canada", label: "Canada" },
  { value: "uk", label: "UK" },
  { value: "germany", label: "Germany" },
  { value: "usa", label: "USA" },
  { value: "ireland", label: "Ireland" },
  { value: "not-sure", label: "Not sure yet — help me decide" },
];

export function DestinationStep({ profile, setField, callouts }: StepProps) {
  return (
    <StepShell
      eyebrow="Step 7"
      title="Where do you want to go?"
      subtext="Pick the one you're most curious about, or let us show you where you fit best."
      callouts={callouts}
    >
      {DESTINATIONS.map((d) => (
        <OptionCard
          key={d.value}
          label={d.label}
          selected={profile.destination === d.value}
          onSelect={() => setField({ destination: d.value })}
        />
      ))}
    </StepShell>
  );
}
