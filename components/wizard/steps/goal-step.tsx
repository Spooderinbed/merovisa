"use client";

import type { Goal } from "@/lib/scoring/types";
import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

const GOALS: Array<{ value: Goal; label: string; description: string }> = [
  { value: "permanent-residency", label: "Permanent residency", description: "Settle long-term after study" },
  { value: "lowest-cost", label: "Lowest total cost", description: "Best value for money" },
  { value: "highest-ranked", label: "Highest-ranked university", description: "Prestige and brand" },
  { value: "fastest-admission", label: "Fastest admission", description: "Start as soon as possible" },
  { value: "best-employment", label: "Best employment outcomes", description: "Strong job prospects" },
  { value: "research", label: "Research opportunities", description: "Academic and research depth" },
];

export function GoalStep({ profile, setField, callouts }: StepProps) {
  return (
    <StepShell
      eyebrow="Step 9"
      title="What matters most to you?"
      subtext="This shapes how we rank your matches — same profile, different priorities, different results."
      callouts={callouts}
    >
      <div role="radiogroup" aria-label="Priority" className="flex flex-col gap-3">
        {GOALS.map((g) => (
          <OptionCard
            key={g.value}
            label={g.label}
            description={g.description}
            selected={profile.goal === g.value}
            onSelect={() => setField({ goal: g.value })}
          />
        ))}
      </div>
    </StepShell>
  );
}
