"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "quiet";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-[background-color,transform] duration-150 ease-calm active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-ink",
  ghost: "border border-line-2 text-ink hover:bg-bg-tint",
  quiet: "text-ink-soft hover:bg-bg-tint",
};

const sizes: Record<Size, string> = {
  sm: "text-[14px] px-[15px] py-2",
  md: "text-[16px] px-[22px] py-3",
  lg: "text-[17px] px-7 py-[15px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** In-flight state: disables the button, sets aria-busy, and appends a mono ellipsis. */
  loading?: boolean;
  /** Copy shown while loading (e.g. "Uploading"). Falls back to children; the ellipsis is the primitive's. */
  loadingLabel?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        // One flex child so the base `gap-2` never splits the label from its
        // ellipsis; the ellipsis is mono (the "system is working" voice) and
        // aria-hidden so the accessible name stays the label alone.
        <span>
          {loadingLabel ?? children}
          <span aria-hidden="true" className="font-mono">
            …
          </span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
