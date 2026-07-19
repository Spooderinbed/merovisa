import type { ProfileCompleteness } from "@/lib/results/completeness";
import { Card } from "@/components/ui/card";

export function CompletenessMeter({ completeness }: { completeness: ProfileCompleteness }) {
  // Band the fill to coarse quartile steps so the bar reads as rough progress, never a
  // raw completeness percentage (product rule: no numeric scores to the user). FLOOR (not
  // round) so the bar never over-reads — only a genuinely full picture fills it to 100%.
  const banded = Math.floor(completeness.completeness / 25) * 25;
  return (
    <Card as="section" padding="lg">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-caption uppercase tracking-wide text-ink-faint">Profile completeness</span>
        <span className="font-mono text-small text-ink-soft">{completeness.level}</span>
      </div>
      <span className="mt-3 block h-2 w-full overflow-hidden rounded-pill bg-bg-tint">
        <span
          data-completeness-fill
          className="block h-full rounded-pill bg-primary transition-[width] duration-slower ease-calm"
          style={{ width: `${banded}%` }}
        />
      </span>
      {completeness.suggestions.length > 0 ? (
        <>
          <p className="mt-4 text-body text-ink-soft">Add more of your picture:</p>
          <ul className="mt-2 flex flex-col gap-2">
            {completeness.suggestions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-body">
                <span className="text-ink">{s.label}</span>
                <span className="text-ink-faint">→ {s.gain}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}
