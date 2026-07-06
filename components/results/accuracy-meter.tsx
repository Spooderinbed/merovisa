import type { ProfileAccuracy } from "@/lib/results/accuracy";
import { Card } from "@/components/ui/card";

export function AccuracyMeter({ accuracy }: { accuracy: ProfileAccuracy }) {
  // Band the fill to discrete quartile steps so the bar reads as coarse
  // progress, never a raw completeness percentage leaking to the user.
  const banded = Math.max(25, Math.floor(accuracy.completeness / 25) * 25);
  return (
    <Card as="section" padding="lg">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Profile accuracy</span>
        <span className="font-mono text-[12.5px] text-ink-soft">
          {accuracy.level} confidence
        </span>
      </div>
      <span className="mt-3 block h-2 w-full overflow-hidden rounded-pill bg-bg-tint">
        <span
          data-accuracy-fill
          className="block h-full rounded-pill bg-primary transition-[width] duration-slower ease-calm"
          style={{ width: `${banded}%` }}
        />
      </span>
      <p className="mt-4 text-[15px] text-ink-soft">Make your assessment more complete:</p>
      <ul className="mt-2 flex flex-col gap-2">
        {accuracy.suggestions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 text-[15px]">
            <span className="text-ink">{s.label}</span>
            <span className="text-ink-faint">→ {s.gain}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
