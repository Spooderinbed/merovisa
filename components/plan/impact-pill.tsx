import type { Impact } from "@/lib/plan/types";

const STYLE: Record<Impact, { label: string; cls: string }> = {
  high: { label: "High impact", cls: "bg-reach-tint text-reach" },
  medium: { label: "Medium impact", cls: "bg-possible-tint text-possible" },
  low: { label: "Low impact", cls: "bg-strong-tint text-strong" },
};

export function ImpactPill({ impact }: { impact: Impact }) {
  const s = STYLE[impact];
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-caption ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
