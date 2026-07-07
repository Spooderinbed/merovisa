"use client";

import type { Goal } from "@/lib/scoring/types";
import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import {
  reconcileSecondaryGoals,
  toggleSecondaryGoal,
  SECONDARY_GOALS_CAP,
} from "@/lib/wizard/secondary-goals";
import type { StepProps } from "./types";

const GOALS: Array<{ value: Goal; label: string; description: string }> = [
  { value: "permanent-residency", label: "Permanent residency", description: "Settle long-term after study" },
  { value: "lowest-cost", label: "Lowest total cost", description: "Best value for money" },
  { value: "highest-ranked", label: "Highest-ranked university", description: "Prestige and brand" },
  { value: "fastest-admission", label: "Fastest admission", description: "Start as soon as possible" },
  { value: "best-employment", label: "Best employment outcomes", description: "Strong job prospects" },
  { value: "research", label: "Research opportunities", description: "Academic and research depth" },
];

export function GoalStep({ profile, setField, callouts, eyebrow }: StepProps) {
  const primary = profile.goal;
  const secondaries = profile.secondaryGoals ?? [];
  const atCap = secondaries.length >= SECONDARY_GOALS_CAP;

  const choosePrimary = (value: Goal) =>
    // Re-picking a goal that was a secondary keeps the two lists disjoint.
    setField({ goal: value, secondaryGoals: reconcileSecondaryGoals(value, secondaries) });

  const toggleExtra = (value: Goal) => {
    if (!primary) return;
    setField({ secondaryGoals: toggleSecondaryGoal(secondaries, value, primary) });
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title="What matters most to you?"
      subtext="We use this to order and label your matches around what you care about — where we have the data to."
      callouts={callouts}
    >
      <div role="radiogroup" aria-label="Priority" className="flex flex-col gap-3">
        {GOALS.map((g) => (
          <OptionCard
            key={g.value}
            label={g.label}
            description={g.description}
            selected={primary === g.value}
            onSelect={() => choosePrimary(g.value)}
          />
        ))}
      </div>

      {primary ? (
        <div className="mt-8 flex animate-rise flex-col gap-3 border-t border-line pt-6">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-caption uppercase tracking-wide text-ink-faint">
              Also aiming for? (optional — up to {SECONDARY_GOALS_CAP})
            </span>
            <p className="text-body text-ink-soft">
              Extra goals add context. They do not combine into a new verdict, and they do not change
              your matches yet.
            </p>
            <span aria-live="polite" className="text-meta text-ink-faint">
              {secondaries.length} of {SECONDARY_GOALS_CAP} selected
            </span>
          </div>
          <div
            role="group"
            aria-label="Other goals you're also aiming for"
            className="flex flex-col gap-3"
          >
            {GOALS.filter((g) => g.value !== primary).map((g) => {
              const selected = secondaries.includes(g.value);
              return (
                <OptionCard
                  key={g.value}
                  label={g.label}
                  description={g.description}
                  multi
                  selected={selected}
                  disabled={!selected && atCap}
                  onSelect={() => toggleExtra(g.value)}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </StepShell>
  );
}
