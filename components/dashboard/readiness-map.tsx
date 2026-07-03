import { buildReadiness, type ReadinessSignals, type ReadinessBand } from "@/lib/readiness/readiness";
import { Card } from "@/components/ui/card";

// The word the band pill shows (and that the row's accessible name repeats) — colour
// is never the sole carrier of state.
const BAND_WORD: Record<ReadinessBand, string> = {
  strong: "strong",
  "needs-work": "needs work",
  risk: "at risk",
  "add-detail": "add detail",
  "in-progress": "in progress",
  "not-started": "not started",
};

// Verdict palette: teal for strong, amber for needs-work, reach-red ONLY for a genuine
// risk band; the neutral/early states stay muted so red never reads as decoration.
const BAND_PILL: Record<ReadinessBand, string> = {
  strong: "bg-strong-tint text-strong",
  "needs-work": "bg-possible-tint text-possible-ink",
  risk: "bg-reach-tint text-reach",
  "add-detail": "border border-line bg-surface text-ink-faint",
  "in-progress": "border border-line bg-surface text-ink-faint",
  "not-started": "border border-line bg-surface text-ink-faint",
};

/**
 * "Your readiness" — the single banded verdict, decomposed into the four signals a
 * student actually acts on. Presentational: it bands via the pure `buildReadiness`
 * helper and renders word+colour rows; it shows no raw scores or percentages in any
 * row (the header carries the only percentage, the profile completeness).
 */
export function ReadinessMap({ signals }: { signals: ReadinessSignals }) {
  const { rows, completenessPct, ariaLabel } = buildReadiness(signals);
  const headerLine =
    completenessPct >= 100
      ? "Based on your full profile."
      : `Based on ${completenessPct}% of your profile — add detail to sharpen this.`;

  return (
    <Card as="section" aria-label="Your readiness" padding="md" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-medium text-ink">Your readiness</h2>
        <p className="text-[13px] text-ink-faint">{headerLine}</p>
      </div>
      {/* One-line summary for screen readers, before the per-row detail. */}
      <p className="sr-only">{ariaLabel}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key}>
            <a
              href={row.href}
              aria-label={`${row.label}, ${BAND_WORD[row.band]}${row.why ? `: ${row.why}` : ""}`}
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-2.5 transition-colors duration-200 ease-calm hover:border-ink-faint"
            >
              <span className="flex flex-col gap-0.5" aria-hidden="true">
                <span className="text-[14px] font-medium text-ink">{row.label}</span>
                {row.why ? <span className="text-[12.5px] text-ink-faint">{row.why}</span> : null}
              </span>
              <span
                aria-hidden="true"
                className={`shrink-0 rounded-pill px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${BAND_PILL[row.band]}`}
              >
                {BAND_WORD[row.band]}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
