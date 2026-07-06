"use client";

import { useEffect } from "react";
import type { Currency, FundingSource } from "@/lib/scoring/types";
import { Card } from "@/components/ui/card";
import { OptionCard } from "@/components/ui/option-card";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { StepShell } from "@/components/wizard/step-shell";
import { formatAud, formatNpr } from "@/lib/utils";
import { FX_RATES, toAud } from "@/lib/data/policy/fx-rates";
import type { StepProps } from "./types";

type WizardCurrency = "NPR" | "AUD";

const RANGES: Record<WizardCurrency, { min: number; max: number; step: number; default: number }> = {
  NPR: { min: 1_000_000, max: 10_000_000, step: 100_000, default: 4_500_000 },
  AUD: { min: 15_000, max: 120_000, step: 1_000, default: 50_000 },
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

export function BudgetStep({ profile, setField, callouts, eyebrow }: StepProps) {
  const stored = profile.budgetCurrency;
  const currency: WizardCurrency = stored === "AUD" ? "AUD" : "NPR";
  const range = RANGES[currency];
  const budget = profile.budget ?? range.default;
  const nprPerAud = FX_RATES.NPR!.value / FX_RATES.AUD!.value;
  const converted =
    currency === "NPR" ? formatAud(toAud(budget, "NPR")) : formatNpr(Math.round(budget * nprPerAud));

  const onCurrency = (next: WizardCurrency) => {
    const nextRange = RANGES[next];
    setField({ budgetCurrency: next as Currency, budget: nextRange.default });
  };

  // Migrate a persisted older session that stored a currency other than the
  // two the wizard now supports (e.g. a stale "USD" value) back to the NPR
  // default, once, on mount.
  useEffect(() => {
    if (stored !== "NPR" && stored !== "AUD") {
      setField({ budgetCurrency: "NPR", budget: RANGES.NPR.default });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      eyebrow={eyebrow}
      title="What's your yearly budget?"
      subtext="Tuition plus living costs, per year. A rough figure is fine."
      callouts={callouts}
    >
      <Segmented
        ariaLabel="Budget currency"
        options={[
          { value: "NPR", label: "NPR" },
          { value: "AUD", label: "AUD" },
        ]}
        value={currency}
        onChange={onCurrency}
      />
      <Card radius="card" padding="sm" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-lead text-ink">
            {currency === "NPR" ? formatNpr(budget) : formatAud(budget)}
          </span>
          <span className="text-body text-ink-soft">≈ {converted}</span>
        </div>
        <Slider
          ariaLabel="Yearly budget"
          min={range.min}
          max={range.max}
          step={range.step}
          value={budget}
          onChange={(v) => setField({ budget: v })}
        />
        <span className="text-small text-ink-faint">
          Indicative rate: NPR {Math.round(nprPerAud)} ≈ A$1
        </span>
      </Card>
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
          <span className="text-body text-ink-soft">
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
              <span className="text-body text-ink-soft">Children</span>
              <button
                type="button"
                aria-label="Remove a child"
                onClick={() => setChildren(children - 1)}
                disabled={children <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-pill border border-line text-ink-soft transition-colors duration-150 ease-calm hover:text-ink disabled:opacity-40"
              >
                −
              </button>
              <span aria-live="polite" className="min-w-6 text-center font-mono text-body text-ink">
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
