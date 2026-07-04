import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * MV-92: the canonical form-field shell, extracted from ~28 verbatim copies
 * across the profile editors so the border / radius / padding / focus contract
 * lives in one place. `Input` renders an <input>, `Select` a <select>; both
 * carry the shell and merge any per-site className (e.g. a fixed width) via
 * cn(). Everything else — type, value, onChange, disabled, aria-* — passes
 * straight through, so these stay drop-in replacements for the raw elements.
 */
const fieldShell =
  "rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink focus:border-primary";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldShell, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldShell, className)} {...props}>
      {children}
    </select>
  );
}
