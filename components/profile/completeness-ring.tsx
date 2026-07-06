import { bandLabel } from "@/lib/scoring/band";
import { Card } from "@/components/ui/card";

export function CompletenessRing({
  pct, complete, partial, empty,
}: { pct: number; complete: number; partial: number; empty: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <Card as="aside" padding="lg" className="flex flex-col gap-3">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Completeness</span>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden>
          <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="6" fill="none" className="text-line-2" />
          <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="6" fill="none"
            className="text-primary transition-[stroke-dashoffset] duration-slower ease-calm"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
          <text x="50" y="55" textAnchor="middle" fontSize="13" className="fill-ink font-medium">{bandLabel(pct)}</text>
        </svg>
        <ul className="flex flex-col gap-1 text-[14px] text-ink-soft">
          <li>{complete} complete</li>
          <li>{partial} partial</li>
          <li>{empty} not started</li>
        </ul>
      </div>
    </Card>
  );
}
