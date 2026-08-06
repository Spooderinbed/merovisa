import { selectScholarships } from "@/lib/data/select-scholarships";
import { SourceAnchor } from "@/components/analytics/source-anchor";
import { Card } from "@/components/ui/card";

/**
 * Curated scholarships reference for Nepal → Australia students. Mirrors
 * CostToApply's calm-authority shell — flat surface, thin borders, a SourceAnchor
 * per row. Purely presentational.
 *
 * Each row is a discrete block, not a list line (MV-162 item 12): the surface tone
 * lifts it off the warm-paper page, the title carries the emphasis weight, and the
 * amount + source line stay data/meta. The lift is deliberately quieter than the
 * filled primary "next step" card — these rows are reference, not the primary action.
 *
 * Honesty guard (trust-first brand): this is a reference list of scholarships a
 * student *may be able to apply for*, never a personalized eligibility verdict.
 * No "you qualify" / "you're eligible" copy; eligibility and criteria live with
 * the provider.
 */
export function ScholarshipsPanel({ today }: { today?: string } = {}) {
  // `today` is where "now" legitimately enters — the selector stays pure. Production
  // renders the real date; tests inject a fixed one so the closed/open window
  // rendering is deterministic (audit F-19).
  const iso = today ?? new Date().toISOString().slice(0, 10);
  const rows = selectScholarships(iso);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[64ch] text-body text-ink-soft">
        Scholarships you may be able to apply for, starting with the fully-funded
        Australia Awards for Nepal. This is a curated reference list, not a personalized
        eligibility check — eligibility and criteria live with the provider.
      </p>

      <ul className="flex flex-col gap-4">
        {rows.map((row) => (
          <Card
            as="li"
            key={row.id}
            radius="card"
            padding="md"
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-lead font-medium text-ink">{row.name}</span>
              <span className="shrink-0 font-mono text-small text-ink-soft">
                {row.amount}
              </span>
            </div>
            <span className="text-caption uppercase tracking-wide text-ink-faint">
              {row.who}
            </span>
            <p className="text-meta text-ink-soft">{row.whatItCovers}</p>
            {row.studyEligibility ? (
              <p className="text-small text-ink-soft">{row.studyEligibility}</p>
            ) : null}
            {row.applicationWindow ? (
              <p className="text-small text-ink-soft">{row.applicationWindow}</p>
            ) : null}
            <SourceAnchor
              surface="matches"
              href={row.source}
              title={row.lastVerified ? `verified ${row.lastVerified}` : undefined}
              className="self-start text-caption text-ink-faint hover:text-primary hover:underline"
            >
              Source{row.lastVerified ? ` — verified ${row.lastVerified}` : ""}
            </SourceAnchor>
          </Card>
        ))}
      </ul>
    </div>
  );
}
