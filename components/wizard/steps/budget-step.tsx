"use client";

import type { Currency, FundingSource } from "@/lib/scoring/types";
import { OptionCard } from "@/components/ui/option-card";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { StepShell } from "@/components/wizard/step-shell";
import { formatNpr, formatUsd } from "@/lib/utils";
import type { StepProps } from "./types";

const NPR_PER_USD = 135;

const RANGES: Record<Currency, { min: number; max: number; step: number; default: number }> = {
  NPR: { min: 1_000_000, max: 10_000_000, step: 100_000, default: 4_500_000 },
  USD: { min: 8_000, max: 80_000, step: 1_000, default: 33_000 },
};

const FUNDING: Array<{ value: FundingSource; label: string }> = [
  { value: "self-funded", label: "Self-funded" },
  { value: "parents-family", label: "Parents / family" },
  { value: "education-loan", label: "Education loan" },
  { value: "mixed", label: "Mixed" },
  { value: "scholarship-dependent", label: "Scholarship-dependent" },
];

export function BudgetStep({ profile, setField, callouts }: StepProps) {
  const currency: Currency = profile.budgetCurrency ?? "NPR";
  const range = RANGES[currency];
  const budget = profile.budget ?? range.default;
  const converted =
    currency === "NPR" ? formatUsd(Math.round(budget / NPR_PER_USD)) : formatNpr(Math.round(budget * NPR_PER_USD));

  const onCurrency = (next: Currency) => {
    const nextRange = RANGES[next];
    setField({ budgetCurrency: next, budget: nextRange.default });
  };

  return (
    <StepShell
      eyebrow="Step 8"
      title="What's your yearly budget?"
      subtext="Tuition plus living costs, per year. A rough figure is fine."
      callouts={callouts}
    >
      <Segmented
        ariaLabel="Budget currency"
        options={[
          { value: "NPR", label: "NPR" },
          { value: "USD", label: "USD" },
        ]}
        value={currency}
        onChange={onCurrency}
      />
      <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[17px] text-ink">
            {currency === "NPR" ? formatNpr(budget) : formatUsd(budget)}
          </span>
          <span className="text-[15px] text-ink-soft">≈ {converted}</span>
        </div>
        <Slider
          ariaLabel="Yearly budget"
          min={range.min}
          max={range.max}
          step={range.step}
          value={budget}
          onChange={(v) => setField({ budget: v })}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FUNDING.map((f) => (
          <OptionCard
            key={f.value}
            label={f.label}
            selected={profile.fundingSource === f.value}
            onSelect={() => setField({ fundingSource: f.value, budget: profile.budget ?? range.default })}
          />
        ))}
      </div>
    </StepShell>
  );
}
