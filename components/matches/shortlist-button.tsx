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
  const [busy, setBusy] = useState(false);

  const choose = async (next: Status) => {
    if (busy || next === status) return;
    setBusy(true);
    const res = await fetch("/api/shortlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, status: next }),
    });
    if (res.ok) setStatus(next);
    setBusy(false);
  };

  return (
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
            disabled={busy}
            aria-pressed={active}
            className={`rounded-pill px-3 py-1 text-[13px] font-medium transition ${
              active ? "bg-strong-tint text-strong" : "text-ink-soft hover:bg-bg-tint"
            }`}
          >
            {step.label}
          </button>
        );
      })}
    </div>
  );
}
