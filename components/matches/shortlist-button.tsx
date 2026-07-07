"use client";

import { useState } from "react";

export type Status = "shortlisted" | "applied" | "withdrawn" | null;

// The funnel progression a student moves through on a program card. Choosing
// "Applied" is the MV-08 capture trigger: /api/shortlist freezes the
// prediction-of-record and opens an attempt (the outcome-validation moat).
const STEPS: { value: Status; label: string }[] = [
  { value: null, label: "Not saved" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "applied", label: "Applied" },
];

export function ShortlistButton({
  programId,
  initialStatus,
}: {
  programId: string;
  initialStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);

  const choose = async (next: Status) => {
    if (next === status) return;
    const prev = status;
    // Optimistic: reflect the choice instantly so the pill never lags behind the
    // tap. The /api/shortlist round-trip (which for "Applied" also freezes the
    // prediction and opens an attempt) confirms in the background.
    setStatus(next);
    try {
      const res = await fetch("/api/shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, status: next }),
      });
      if (!res.ok) setStatus(prev); // server rejected — roll the pill back
    } catch {
      setStatus(prev); // network failed — roll the pill back
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        role="group"
        aria-label="Application status"
        className="inline-flex items-center gap-0.5 rounded-pill border border-line-2 p-0.5"
      >
        {STEPS.map((step) => {
          const active = step.value === status;
          return (
            <button
              key={step.label}
              type="button"
              onClick={() => choose(step.value)}
              aria-pressed={active}
              className={`rounded-pill px-3 py-1 text-small font-medium transition ${
                active ? "bg-strong-tint text-strong" : "text-ink-soft hover:bg-bg-tint"
              }`}
            >
              {step.label}
            </button>
          );
        })}
      </div>
      <p className="max-w-[15rem] text-right text-caption text-ink-faint">
        Marking Applied locks in this verdict so we can compare it against your real outcome.
      </p>
    </div>
  );
}
