import { selectCostEstimate } from "@/lib/data/cost-estimate";
import type { CostLine } from "@/lib/data/cost-to-apply";
import { AU_OSHC_PREMIUMS } from "@/lib/data/source/au-oshc-premiums";
import { SourceAnchor } from "@/components/analytics/source-anchor";
import { Card } from "@/components/ui/card";

const isHttp = (s: string) => /^https?:\/\//.test(s);

function formatAmount(line: Pick<CostLine, "amount" | "amountMax" | "currency">): string {
  const low = line.amount.toLocaleString();
  if (line.amountMax !== undefined) {
    return `${line.currency} ${low}–${line.amountMax.toLocaleString()}`;
  }
  return `${line.currency} ${low}`;
}

/**
 * Honest "first-year cost estimate" panel for the matches Cost tab — composes the
 * sourced tuition / living / OSHC / visa figures into one AUD band. Figures with a
 * real source link out (DHA living, the visa charge, the OSHC rate cards); the
 * representative tuition median carries no http source, so it renders as a labeled
 * estimate, not a fake citation. The OSHC-by-provider list shows the multiple
 * approved providers — three priced, two quote-only — each one click from its source.
 * Mirrors CostToApply's calm-authority shell. Purely presentational.
 */
export function CostEstimatePanel() {
  const { lines, totalMin, totalMax, note, currency } = selectCostEstimate();

  return (
    <Card as="aside" radius="card" tone="tint" padding="sm" className="flex flex-col gap-3 text-meta text-ink-soft">
      <span className="text-caption uppercase tracking-wide text-ink-faint">
        First-year cost estimate (Nepal &rarr; Australia)
      </span>

      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line.label} className="flex items-baseline justify-between gap-3">
            <span>
              {line.label}
              {line.note ? <span className="text-ink-faint"> &mdash; {line.note}</span> : null}
            </span>
            {isHttp(line.source) ? (
              <SourceAnchor
                surface="cost-estimate"
                href={line.source}
                title={line.lastVerified ? `verified ${line.lastVerified}` : undefined}
                className="shrink-0 font-mono text-ink hover:text-primary hover:underline"
              >
                {formatAmount(line)}
              </SourceAnchor>
            ) : (
              <span
                className="shrink-0 font-mono text-ink"
                title={line.lastVerified ? `verified ${line.lastVerified}` : undefined}
              >
                {formatAmount(line)}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1 text-ink">
        <span className="text-ink-faint">Indicative first-year total</span>
        <span className="font-mono">
          {currency} {totalMin.toLocaleString()}&ndash;{totalMax.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-caption uppercase tracking-wide text-ink-faint">
          OSHC by provider (single cover, per year)
        </span>
        <ul className="flex flex-col gap-1">
          {AU_OSHC_PREMIUMS.map((provider) => (
            <li key={provider.id} className="flex items-baseline justify-between gap-3">
              <span>{provider.provider}</span>
              <SourceAnchor
                surface="cost-estimate"
                href={provider.source}
                title={`verified ${provider.lastVerified}`}
                className={`shrink-0 font-mono hover:text-primary hover:underline ${
                  provider.quoteOnly ? "text-ink-faint" : "text-ink"
                }`}
              >
                {provider.quoteOnly
                  ? "Quote only"
                  : `AUD ${Math.round(provider.singleCoverAudPerYear as number).toLocaleString()}`}
              </SourceAnchor>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-small text-ink-faint">{note}</p>
    </Card>
  );
}
