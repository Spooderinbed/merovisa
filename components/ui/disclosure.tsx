"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Generic collapsible disclosure — a calm-authority shell for tucking secondary
 * content behind a single accessible toggle. Collapsed by default; pass
 * `defaultOpen` to start expanded. The trigger is a real <button> wired to its
 * panel via aria-controls/aria-expanded, so it is keyboard- and screen-reader
 * operable. Purely presentational; holds no domain knowledge.
 */
export function Disclosure({
  title,
  subtitle,
  trailing,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  /** Optional adornment shown in the trigger beside the chevron (e.g. a status pill). */
  trailing?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={cn("overflow-hidden rounded-lg border border-line bg-surface", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors duration-150 ease-calm hover:bg-bg-tint"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-[16px] font-medium text-ink">{title}</span>
          {subtitle ? <span className="text-[13.5px] text-ink-soft">{subtitle}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {trailing}
          <span
            className={cn(
              "text-ink-faint transition-transform duration-200 ease-calm",
              open && "rotate-90",
            )}
            aria-hidden
          >
            &rsaquo;
          </span>
        </span>
      </button>
      {open ? (
        <div id={panelId} className="flex flex-col gap-4 border-t border-line p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
