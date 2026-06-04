"use client";

import { useState } from "react";

type Status = "shortlisted" | "applied" | "withdrawn" | null;

export function ShortlistButton({
  programId,
  initialStatus,
}: {
  programId: string;
  initialStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, setBusy] = useState(false);
  const isShortlisted = status === "shortlisted";

  const toggle = async () => {
    setBusy(true);
    const next: Status = isShortlisted ? null : "shortlisted";
    const res = await fetch("/api/shortlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, status: next }),
    });
    if (res.ok) setStatus(next);
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`rounded-pill border px-4 py-2 text-[14px] font-medium transition ${
        isShortlisted
          ? "border-strong bg-strong-tint text-strong"
          : "border-line-2 text-ink-soft hover:bg-bg-tint"
      }`}
      aria-pressed={isShortlisted}
    >
      {isShortlisted ? "✓ Shortlisted" : "Shortlist"}
    </button>
  );
}
