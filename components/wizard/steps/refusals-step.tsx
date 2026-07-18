"use client";

import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

type Refusals = "none" | "one" | "multiple";

const OPTIONS: Array<{ value: Refusals; label: string; description: string }> = [
  { value: "none", label: "No prior refusals", description: "No visa application of mine has been refused" },
  { value: "one", label: "Yes, once", description: "One previous refusal" },
  { value: "multiple", label: "Yes, more than once", description: "Two or more previous refusals" },
];

// F-1 — the last wizard step. A prior visa refusal is a real DHA Subclass 500 risk
// factor the verdict already penalises, so we ask before showing any result: a
// student who has one deserves an honest estimate up front, not a rosy number that
// silently drops a band the moment they volunteer the refusal in their profile.
// No option is preselected — we never assume "none" on the student's behalf.
export function RefusalsStep({ profile, setField, callouts, eyebrow }: StepProps) {
  const current = profile.priorRefusals;
  return (
    <StepShell
      eyebrow={eyebrow}
      title="Have you ever had a visa refused?"
      subtext="Refusals are common and not a dead end — we ask now so your estimate is honest rather than optimistic, and we can show you how to strengthen your case."
      callouts={callouts}
    >
      <div role="radiogroup" aria-label="Prior visa refusals" className="flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <OptionCard
            key={o.value}
            label={o.label}
            description={o.description}
            selected={current === o.value}
            onSelect={() => setField({ priorRefusals: o.value })}
          />
        ))}
      </div>
    </StepShell>
  );
}
