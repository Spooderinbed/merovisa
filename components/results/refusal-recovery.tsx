import { NEPAL_REFUSAL_RECOVERY } from "@/lib/data/source/nepal-refusal-recovery";
import type { NepalRefusalRecovery } from "@/lib/data/types";
import { SourceAnchor } from "@/components/analytics/source-anchor";

const SECTIONS: { kind: NepalRefusalRecovery["kind"]; heading: string }[] = [
  { kind: "refusal-ground", heading: "Why applications are refused" },
  { kind: "grant-rate", heading: "Honest odds — by sector" },
  { kind: "recovery-path", heading: "If you're refused" },
  { kind: "review-outcome", heading: "What a review can result in" },
  { kind: "scam-warning", heading: "What not to trust" },
];

// User-locked copy (verbatim).
const VET_GUARD =
  "We show VET as a contrast because some students are steered into cheaper courses — it is not your personal probability.";
const DISCLAIMER = "General context for Nepal → Australia, not legal advice.";

/** Grant-rate rows: HE emphasized (text-ink), VET as contrast (text-ink-soft). All others soft. */
function rowClass(r: NepalRefusalRecovery): string {
  if (r.kind === "grant-rate") return r.sector === "higher-education" ? "text-ink" : "text-ink-soft";
  return "text-ink-soft";
}

/**
 * Trust-defense panel — the honest truth about Nepal → Australia refusal: why
 * applications fail, sector grant rates (HE vs VET), what recovery looks like, and
 * what not to trust. Gov-sourced, every row linked to its source. Mirrors
 * CostToApply's calm-authority shell. Purely presentational; no personal odds.
 */
export function RefusalRecovery() {
  return (
    <aside className="flex flex-col gap-3 rounded-md border border-line bg-bg-tint p-4 text-[14px] text-ink-soft">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Refusal risk &amp; recovery (Nepal &rarr; Australia)
      </span>

      <div className="flex flex-col gap-3">
        {SECTIONS.map((section) => (
          <div key={section.kind} className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              {section.heading}
            </span>
            <ul className="flex flex-col gap-1">
              {NEPAL_REFUSAL_RECOVERY.filter((r) => r.kind === section.kind).map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3">
                  <span className={rowClass(r)}>{r.summary}</span>
                  <SourceAnchor
                    surface="refusal-recovery"
                    href={r.source}
                    title={r.lastVerified ? `verified ${r.lastVerified}` : undefined}
                    className="shrink-0 font-mono text-ink hover:text-primary hover:underline"
                  >
                    {r.label}
                  </SourceAnchor>
                </li>
              ))}
            </ul>
            {section.kind === "grant-rate" ? (
              <p className="text-[12.5px] text-ink-faint">{VET_GUARD}</p>
            ) : null}
          </div>
        ))}
      </div>

      <p className="text-[12.5px] text-ink-faint">{DISCLAIMER}</p>
    </aside>
  );
}
