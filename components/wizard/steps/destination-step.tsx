"use client";

import type { Destination } from "@/lib/scoring/types";
import { isDestinationSupported } from "@/lib/scoring/types";
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

function isSelectable(value: Destination): boolean {
  return isDestinationSupported(value) || value === "not-sure";
}

export function DestinationStep({ profile, setField, callouts, eyebrow }: StepProps) {
  return (
    <StepShell
      eyebrow={eyebrow}
      title="Where do you want to go?"
      subtext="We fully cover Nepal → Australia today — more destinations are on the way. Pick Australia, or let us show you where you fit best."
      callouts={callouts}
    >
      <div role="radiogroup" aria-label="Destination" className="flex flex-col gap-3">
        {DESTINATIONS.map((d) => {
          const selectable = isSelectable(d.value);
          return (
            <OptionCard
              key={d.value}
              label={d.label}
              selected={profile.destination === d.value}
              onSelect={() => setField({ destination: d.value })}
              disabled={!selectable}
              description={selectable ? undefined : "Coming soon"}
            />
          );
        })}
      </div>
    </StepShell>
  );
}
