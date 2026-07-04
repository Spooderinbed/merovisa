"use client";

import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import { computeGapYears, GAP_REQUIRES_REASON_THRESHOLD } from "@/lib/scoring/gap";
import type { StepProps } from "./types";

const CURRENT_YEAR = new Date().getFullYear();
const RECENT_YEARS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - i);

export function GraduationYearStep({ profile, setField, callouts, eyebrow }: StepProps) {
  const selected = profile.graduationYear;
  const isEarlier = typeof selected === "number" && !RECENT_YEARS.includes(selected);
  const gap = typeof selected === "number" ? computeGapYears(selected) : 0;
  const showGapPreview = typeof selected === "number" && gap > GAP_REQUIRES_REASON_THRESHOLD;
  return (
    <StepShell
      eyebrow={eyebrow}
      title="When did (or will) you graduate?"
      subtext="We use this to assess your timeline and flag anything visa officers look at."
      callouts={callouts}
    >
      <div role="radiogroup" aria-label="Graduation year" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RECENT_YEARS.map((y) => (
          <OptionCard
            key={y}
            label={String(y)}
            selected={selected === y}
            onSelect={() => setField({ graduationYear: y })}
          />
        ))}
        <OptionCard
          label="Earlier"
          selected={isEarlier}
          onSelect={() => setField({ graduationYear: 2015 })}
        />
      </div>
      {isEarlier ? (
        <label className="mt-2 flex flex-col gap-1 text-[15px] text-ink-soft">
          Graduation year
          <input
            type="number"
            min={2010}
            max={CURRENT_YEAR}
            value={selected ?? CURRENT_YEAR}
            onChange={(e) => setField({ graduationYear: Number(e.target.value) })}
            className="rounded-sm border border-line-2 bg-surface px-3 py-2 text-ink focus:border-primary"
          />
        </label>
      ) : null}
      {showGapPreview ? (
        <p className="mt-2 text-[15px] text-accent">
          That&rsquo;s a {gap}-year gap — we&rsquo;ll ask what you were doing; explaining it well strengthens your case.
        </p>
      ) : null}
    </StepShell>
  );
}
