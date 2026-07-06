"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface OptionCardProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
  description?: string;
  icon?: ReactNode;
  multi?: boolean;
  disabled?: boolean;
}

export function OptionCard({ label, selected, onSelect, description, icon, multi = false, disabled = false }: OptionCardProps) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors duration-150 ease-calm",
        selected ? "border-primary bg-primary-tint" : "border-line-2 bg-surface hover:bg-surface-2",
        disabled && "cursor-not-allowed bg-surface-2 opacity-60 hover:bg-surface-2",
      )}
    >
      {icon ? <span className="shrink-0 text-ink-soft">{icon}</span> : null}
      <span className="flex-1">
        <span className={cn("block", disabled ? "text-ink-soft" : "text-ink")}>{label}</span>
        {description ? <span className="block text-body text-ink-soft">{description}</span> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "grid size-5 shrink-0 place-items-center border text-caption text-on-primary transition-colors",
          multi ? "rounded-[6px]" : "rounded-pill",
          selected ? "border-primary bg-primary" : "border-line-2",
        )}
      >
        {selected ? (multi ? "✓" : <span className="size-2 rounded-pill bg-on-primary" />) : null}
      </span>
    </button>
  );
}
