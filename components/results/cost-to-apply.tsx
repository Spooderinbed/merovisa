import { selectCostToApply, type CostLine } from "@/lib/data/cost-to-apply";
import { SourceAnchor } from "@/components/analytics/source-anchor";

function formatAmount(line: CostLine): string {
  const low = line.amount.toLocaleString();
  if (line.amountMax !== undefined) {
    return `${line.currency} ${low}–${line.amountMax.toLocaleString()}`;
  }
  return `${line.currency} ${low}`;
}

/**
 * Honest "what it costs to apply" panel — grouped by currency, every figure linked
 * to its source. Mirrors PolicyBanner's calm-authority shell. Purely presentational.
 */
export function CostToApply() {
  const { groups, note } = selectCostToApply();

  return (
    <aside className="flex flex-col gap-3 rounded-md border border-line bg-bg-tint p-4 text-[14px] text-ink-soft">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        What it costs to apply (Nepal &rarr; Australia)
      </span>

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.heading} className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              {group.heading}
            </span>
            <ul className="flex flex-col gap-1">
              {group.lines.map((line) => (
                <li key={line.label} className="flex items-baseline justify-between gap-3">
                  <span>
                    {line.label}
                    {line.note ? <span className="text-ink-faint"> &mdash; {line.note}</span> : null}
                  </span>
                  <SourceAnchor
                    surface="cost-to-apply"
                    href={line.source}
                    title={line.lastVerified ? `verified ${line.lastVerified}` : undefined}
                    className="shrink-0 font-mono text-ink hover:text-primary hover:underline"
                  >
                    {formatAmount(line)}
                  </SourceAnchor>
                </li>
              ))}
            </ul>
            {group.subtotal !== undefined ? (
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1 text-ink">
                <span className="text-ink-faint">Core steps</span>
                <span className="font-mono">
                  {group.currency} {group.subtotal.toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <p className="text-[12.5px] text-ink-faint">{note}</p>
    </aside>
  );
}
