"use client";

import { useEffect } from "react";
import type { StudentProfile } from "@/lib/scoring/types";
import { computeGapYears } from "@/lib/scoring/gap";
import { formatNpr, formatUsd, formatAud } from "@/lib/utils";
import {
  EDUCATION_LABELS,
  FIELD_LABELS,
  DESTINATION_LABELS,
  FUNDING_LABELS,
  GOAL_LABELS,
  GAP_REASON_LABELS,
} from "@/lib/labels";

export function recapLines(p: StudentProfile): string[] {
  const lines: string[] = [];
  lines.push([p.homeCountry, EDUCATION_LABELS[p.educationLevel], FIELD_LABELS[p.fieldOfStudy]].join(" · "));

  if (p.alsoConsidering && p.alsoConsidering.length > 0) {
    lines.push(`also considering: ${p.alsoConsidering.map((f) => FIELD_LABELS[f]).join(", ")}`);
  }

  const english =
    p.englishStatus === "taken" && typeof p.englishScore === "number"
      ? `IELTS ${p.englishScore.toFixed(1)}`
      : p.englishStatus === "booked"
        ? "IELTS booked"
        : "IELTS pending";
  // The wizard usually collects grade as a 0–100 percentage, but a CGPA scale
  // (e.g. 3.4/4) must never be rounded and printed as a bogus percentage.
  const gradeText = p.gradeSystem === "cgpa-4" ? `GPA ${p.grade.toFixed(1)}/4` : `${Math.round(p.grade)}%`;
  lines.push([gradeText, english].join(" · "));

  const gap = computeGapYears(p.graduationYear);
  if (gap > 0) {
    const reasons = p.gapReasons.map((r) => GAP_REASON_LABELS[r]);
    lines.push([`${gap} year${gap > 1 ? "s" : ""} gap`, ...reasons].join(" · "));
  }

  const budget =
    p.budgetCurrency === "NPR"
      ? `${formatNpr(p.budget)}/yr`
      : p.budgetCurrency === "AUD"
        ? `${formatAud(p.budget)}/yr`
        : `${formatUsd(p.budget)}/yr`;
  lines.push([DESTINATION_LABELS[p.destination], budget, FUNDING_LABELS[p.fundingSource]].join(" · "));
  lines.push(`Priority: ${GOAL_LABELS[p.goal]}`);
  if (p.secondaryGoals && p.secondaryGoals.length > 0) {
    lines.push(`Also aiming for: ${p.secondaryGoals.map((g) => GOAL_LABELS[g]).join(", ")}`);
  }
  return lines;
}

// Honest reveal window: a deliberate ~2s beat that lets the word cascade play out
// in full over the user's REAL answers — a smooth confirmation, not padding and
// never fake "analyzing" work (founder feedback: the earlier sub-second reveal
// felt too fast). The real transition in AssessFlow is gated on
// `payload && recapElapsed`, so results appear at max(real API latency, this
// window) — honest waiting only, still under the retired 3000ms "Analyzing"
// theatre that held a ready result for 3 seconds regardless of what was on screen.
export function ProfileRecap({
  profile,
  onDone,
  durationMs = 2000,
}: {
  profile: StudentProfile;
  onDone?: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), durationMs);
    return () => clearTimeout(t);
  }, [onDone, durationMs]);

  const lines = recapLines(profile);
  // Each line's starting global word index, summed from earlier lines' word
  // counts — keeps the cascade delay global without reassigning a counter
  // during render (react-hooks/immutability).
  const lineStart = lines.map((_, i) =>
    lines.slice(0, i).reduce((sum, line) => sum + line.split(" ").length, 0),
  );
  return (
    <div className="grid min-h-[70vh] place-items-center px-5">
      <div className="flex w-full max-w-narrow flex-col items-center gap-3 text-center">
        <span className="font-mono text-caption uppercase tracking-wide text-ink-faint">
          Your answers
        </span>
        {lines.map((line, i) => {
          const words = line.split(" ");
          return (
            <p key={i} className="text-title text-ink">
              {words.map((word, j) => {
                const delay = Math.min(((lineStart[i] ?? 0) + j) * 0.07, 1.2);
                return (
                  <span
                    key={j}
                    className="animate-rise inline-block"
                    style={{ animationDelay: `${delay}s` }}
                  >
                    {word}
                    {j < words.length - 1 ? " " : ""}
                  </span>
                );
              })}
            </p>
          );
        })}
        <span className="mt-4 inline-block size-2 animate-pulse rounded-pill bg-primary" aria-hidden />
      </div>
    </div>
  );
}
