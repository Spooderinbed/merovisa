"use client";

import type { Currency, FundingSource } from "@/lib/scoring/types";
import { OptionCard } from "@/components/ui/option-card";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { StepShell } from "@/components/wizard/step-shell";
import { formatNpr, formatUsd } from "@/lib/utils";
import type { StepProps } from "./types";

const NPR_PER_USD = 135;

type WizardCurrency = "NPR" | "USD";

const RANGES: Record<WizardCurrency, { min: number; max: number; step: number; default: number }> = {
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

const MAX_CHILDREN = 10;

type FamilyMode = "none" | "partner" | "partner-kids";

const FAMILY_OPTIONS: Array<{ value: FamilyMode; label: string }> = [
  { value: "none", label: "Just me" },
  { value: "partner", label: "Partner" },
  { value: "partner-kids", label: "Partner + children" },
];

export function BudgetStep({ profile, setField, callouts }: StepProps) {
  const stored = profile.budgetCurrency;
  const currency: WizardCurrency = stored === "USD" ? "USD" : "NPR";
  const range = RANGES[currency];
  const budget = profile.budget ?? range.default;
  const converted =
    currency === "NPR" ? formatUsd(Math.round(budget / NPR_PER_USD)) : formatNpr(Math.round(budget * NPR_PER_USD));

  const onCurrency = (next: WizardCurrency) => {
    const nextRange = RANGES[next];
    setField({ budgetCurrency: next as Currency, budget: nextRange.default });
  };

  // Dependents raise the DHA financial-capacity floor — relevant only for the
  // Australia gate, so the control only shows for that destination.
  const dependents = profile.dependents;
  const children = dependents?.children ?? 0;
  const familyMode: FamilyMode =
    !dependents || (!dependents.partner && children === 0) ? "none" : children > 0 ? "partner-kids" : "partner";

  const onFamilyMode = (mode: FamilyMode) => {
    if (mode === "none") setField({ dependents: undefined });
    else if (mode === "partner") setField({ dependents: { partner: true, children: 0 } });
    else setField({ dependents: { partner: true, children: Math.max(1, children) } });
  };

  const setChildren = (n: number) => {
    setField({ dependents: { partner: true, children: Math.min(MAX_CHILDREN, Math.max(1, n)) } });
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
      <div role="radiogroup" aria-label="Funding source" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FUNDING.map((f) => (
          <OptionCard
            key={f.value}
            label={f.label}
            selected={profile.fundingSource === f.value}
            onSelect={() => setField({ fundingSource: f.value, budget: profile.budget ?? range.default })}
          />
        ))}
      </div>

      {profile.destination === "australia" && (
        <div className="flex flex-col gap-3">
          <span className="text-[15px] text-ink-soft">
            Bringing family to Australia? <span className="text-ink-faint">(optional)</span>
          </span>
          <Segmented
            ariaLabel="Bringing family to Australia?"
            options={FAMILY_OPTIONS}
            value={familyMode}
            onChange={onFamilyMode}
          />
          {familyMode === "partner-kids" && (
            <div className="flex items-center gap-3">
              <span className="text-[15px] text-ink-soft">Children</span>
              <button
                type="button"
                aria-label="Remove a child"
                onClick={() => setChildren(children - 1)}
                disabled={children <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-pill border border-line text-ink-soft transition-colors duration-150 ease-calm hover:text-ink disabled:opacity-40"
              >
                −
              </button>
              <span aria-live="polite" className="min-w-6 text-center font-mono text-[15px] text-ink">
                {children}
              </span>
              <button
                type="button"
                aria-label="Add a child"
                onClick={() => setChildren(children + 1)}
                disabled={children >= MAX_CHILDREN}
                className="flex h-8 w-8 items-center justify-center rounded-pill border border-line text-ink-soft transition-colors duration-150 ease-calm hover:text-ink disabled:opacity-40"
              >
                +
              </button>
            </div>
          )}
        </div>
      )}
    </StepShell>
  );
}
