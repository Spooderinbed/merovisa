import { selectScholarships } from "@/lib/data/select-scholarships";
import { SourceAnchor } from "@/components/analytics/source-anchor";

/**
 * Curated scholarships reference for Nepal → Australia students. Mirrors
 * CostToApply's calm-authority shell — flat surface, thin borders, a SourceAnchor
 * per row. Purely presentational.
 *
 * Honesty guard (trust-first brand): this is a reference list of scholarships a
 * student *may be able to apply for*, never a personalized eligibility verdict.
 * No "you qualify" / "you're eligible" copy; eligibility and criteria live with
 * the provider.
 */
export function ScholarshipsPanel() {
  const rows = selectScholarships();

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[64ch] text-[15px] text-ink-soft">
        Scholarships you may be able to apply for, starting with the fully-funded
        Australia Awards for Nepal. This is a curated reference list, not a personalized
        eligibility check — eligibility and criteria live with the provider.
      </p>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-1.5 rounded-md border border-line bg-bg-tint p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] text-ink">{row.name}</span>
              <span className="shrink-0 font-mono text-[13px] text-ink-soft">
                {row.amount}
              </span>
            </div>
            <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
              {row.who}
            </span>
            <p className="text-[14px] text-ink-soft">{row.whatItCovers}</p>
            <SourceAnchor
              surface="matches"
              href={row.source}
              title={row.lastVerified ? `verified ${row.lastVerified}` : undefined}
              className="self-start font-mono text-[11.5px] text-ink-faint hover:text-primary hover:underline"
            >
              Source{row.lastVerified ? ` — verified ${row.lastVerified}` : ""}
            </SourceAnchor>
          </li>
        ))}
      </ul>
    </div>
  );
}
