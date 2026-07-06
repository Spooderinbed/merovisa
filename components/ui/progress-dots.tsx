import { cn } from "@/lib/utils";

export interface ProgressDotsProps {
  total: number;
  current: number; // 0-indexed
}

export function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-pill transition-[width,background-color] duration-slow ease-calm",
            i <= current ? "w-6 bg-primary" : "w-1.5 bg-bg-tint",
          )}
        />
      ))}
    </div>
  );
}
