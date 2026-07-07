"use client";

import type { GapReason } from "@/lib/scoring/types";
import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

const REASONS: Array<{ value: GapReason; label: string }> = [
  { value: "worked", label: "Worked or interned" },
  { value: "retook-exams", label: "Retook / improved exams" },
  { value: "health-family", label: "Health or family reasons" },
  { value: "started-something", label: "Started something of my own" },
  { value: "preparing", label: "Preparing for tests / applications" },
];

export function GapStep({ profile, setField, callouts, eyebrow }: StepProps) {
  const current = profile.gapReasons ?? [];
  const toggle = (value: GapReason) => {
    const next = current.includes(value) ? current.filter((r) => r !== value) : [...current, value];
    setField({ gapReasons: next });
  };
  return (
    <StepShell
      eyebrow={eyebrow}
      title="What were you doing in that time?"
      subtext="Pick all that apply. Explaining this well actually strengthens your visa case."
      callouts={callouts}
    >
      <p className="mb-1 text-body text-ink-soft">
        A gap is normal — most applicants have one. What matters is that it&rsquo;s explained.
      </p>
      <div role="group" aria-label="Gap reasons" className="flex flex-col gap-3">
        {REASONS.map((r) => (
          <OptionCard
            key={r.value}
            label={r.label}
            multi
            selected={current.includes(r.value)}
            onSelect={() => toggle(r.value)}
          />
        ))}
      </div>
    </StepShell>
  );
}
