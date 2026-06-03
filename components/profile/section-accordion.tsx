"use client";

import { useState } from "react";
import type { SectionStatus } from "@/lib/profiles/completeness";

const STATUS_LABEL: Record<SectionStatus, string> = {
  complete: "Complete",
  partial:  "Partial",
  empty:    "Not started",
};

const STATUS_CLS: Record<SectionStatus, string> = {
  complete: "bg-strong-tint text-strong",
  partial:  "bg-possible-tint text-possible",
  empty:    "bg-bg-tint text-ink-faint",
};

export function SectionAccordion({
  title, summary, status, children,
}: {
  title: string; summary: string; status: SectionStatus; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <article className="overflow-hidden rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-bg-tint"
        aria-expanded={open}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[16px] font-medium text-ink">{title}</span>
          <span className="text-[14px] text-ink-soft">{summary || "Not added yet"}</span>
        </div>
        <span className={`inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 font-mono text-[11.5px] ${STATUS_CLS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </button>
      {open ? <div className="border-t border-line p-5">{children}</div> : null}
    </article>
  );
}
