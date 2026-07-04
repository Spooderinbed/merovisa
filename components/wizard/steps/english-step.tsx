"use client";

import type { EnglishStatus, EnglishTest } from "@/lib/scoring/types";
import { toIeltsEquivalent } from "@/lib/scoring/english-equivalent";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

const STATUSES = [
  { value: "not-taken" as EnglishStatus, label: "Not taken" },
  { value: "booked" as EnglishStatus, label: "Booked" },
  { value: "taken" as EnglishStatus, label: "Taken" },
];

const TESTS = [
  { value: "ielts" as EnglishTest, label: "IELTS" },
  { value: "pte" as EnglishTest, label: "PTE" },
  { value: "toefl" as EnglishTest, label: "TOEFL" },
];

// Per-test score control config + the default score each test starts at (its
// IELTS-6.5 equivalent), used when "Taken" is chosen or the test is switched.
const TEST_SCALE: Record<EnglishTest, { min: number; max: number; step: number; default: number; label: string }> = {
  ielts: { min: 4, max: 9, step: 0.5, default: 6.5, label: "IELTS band" },
  pte: { min: 10, max: 90, step: 1, default: 58, label: "PTE score" },
  toefl: { min: 0, max: 120, step: 1, default: 79, label: "TOEFL iBT score" },
};

export function EnglishStep({ profile, setField, callouts, eyebrow }: StepProps) {
  const status = profile.englishStatus;
  const test: EnglishTest = profile.englishTest ?? "ielts";
  const scale = TEST_SCALE[test];
  const score = profile.englishScore ?? scale.default;

  const onStatus = (next: EnglishStatus) => {
    if (next === "taken") {
      setField({ englishStatus: "taken", englishScore: profile.englishScore ?? scale.default });
    } else {
      setField({ englishStatus: next, englishScore: undefined });
    }
  };

  const onTest = (next: EnglishTest) => {
    // Reset the score to the new test's default so a carried-over value can't sit
    // outside the new scale (e.g. an IELTS 6.5 left in a PTE field).
    setField({ englishTest: next, englishScore: TEST_SCALE[next].default });
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title="Where are you with English?"
      subtext="Most destinations need proof of English. Even a planned test helps us tailor your matches."
      callouts={callouts}
    >
      <Segmented ariaLabel="English status" options={STATUSES} value={status} onChange={onStatus} />
      {status === "taken" ? (
        <Card radius="card" padding="sm" className="mt-2 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-ink-soft">Which test?</span>
            <Segmented ariaLabel="English test" options={TESTS} value={test} onChange={onTest} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] text-ink-soft">{scale.label}</span>
              <span className="font-mono text-[15px] text-ink">
                {test === "ielts" ? score.toFixed(1) : score}
              </span>
            </div>
            <Slider
              ariaLabel={scale.label}
              min={scale.min}
              max={scale.max}
              step={scale.step}
              value={score}
              onChange={(v) => setField({ englishScore: v })}
            />
            {test !== "ielts" ? (
              <span className="text-[13px] text-ink-soft">
                ≈ IELTS {toIeltsEquivalent(score, test).toFixed(1)} equivalent
              </span>
            ) : null}
          </div>
        </Card>
      ) : (
        <p className="mt-2 text-[13px] text-ink-soft">
          Until you test, we&apos;ll assume a provisional IELTS 6.0.
        </p>
      )}
    </StepShell>
  );
}
