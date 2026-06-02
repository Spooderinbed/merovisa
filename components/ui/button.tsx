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
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
