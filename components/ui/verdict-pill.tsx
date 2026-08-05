import type { Verdict } from "@/lib/scoring/types";
import { VERDICT_LABELS } from "@/lib/scoring/verdict-labels";
import { cn } from "@/lib/utils";

// Colour classes lifted from results/verdict-card's VERDICT_META — the contrast-tuned
// set (possible text uses the -ink token, which the duplicated pill sites had drifted from).
const verdictCls: Record<Verdict, string> = {
  strong: "bg-strong-tint text-strong",
  possible: "bg-possible-tint text-possible-ink",
  reach: "bg-reach-tint text-reach",
};

type Size = "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  sm: "px-2 py-0.5 text-caption",
  md: "px-2.5 py-0.5 text-caption",
  lg: "px-3 py-1 text-small",
};

export function VerdictPill({
  verdict,
  size = "md",
  className,
}: {
  verdict: Verdict;
  size?: Size;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-pill", sizes[size], verdictCls[verdict], className)}>
      {VERDICT_LABELS[verdict].label}
    </span>
  );
}
