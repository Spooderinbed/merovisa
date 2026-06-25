"use client";

import { cn } from "@/lib/utils";

export interface SliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  className?: string;
}

export function Slider({ min, max, step, value, onChange, ariaLabel, className }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ background: `linear-gradient(to right, var(--primary) ${pct}%, var(--bg-tint) ${pct}%)` }}
      className={cn(
        "h-2 w-full cursor-pointer appearance-none rounded-pill",
        "[&::-webkit-slider-thumb]:size-[26px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-pill [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-surface",
        "[&::-moz-range-thumb]:size-[26px] [&::-moz-range-thumb]:rounded-pill [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-surface",
        className,
      )}
    />
  );
}
