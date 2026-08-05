import { Card } from "@/components/ui/card";
import type { Verdict } from "@/lib/scoring/types";
import { VERDICT_LABELS } from "@/lib/scoring/verdict-labels";
import type { SecondaryVerdicts as SecondaryVerdictsData } from "@/lib/results/secondary-verdicts";

// Reuse the exact verdict colour classes from the primary VerdictCard so a secondary
// pill can never drift from the band palette it mirrors.
const VERDICT_CLS: Record<Verdict, string> = {
  strong: "bg-strong-tint text-strong",
  possible: "bg-possible-tint text-possible-ink",
  reach: "bg-reach-tint text-reach",
};

// Bare band word for prose (the pill uses VERDICT_LABELS[...].label, which is
// surface-specific — "Strong match" reads oddly mid-sentence).
const BAND_WORD: Record<Verdict, string> = {
  strong: "Strong",
  possible: "Possible",
  reach: "Reach",
};

/**
 * Compact, clearly-conditional banded verdicts for each "also considering" field,
 * shown beneath the unchanged primary VerdictCard (Option C / MV-102). The primary
 * verdict is never touched by this block. Renders nothing when there are no extras.
 *
 * The conditional framing is mandatory, not implied: the section label states the
 * hypothetical outright and each row restates it in the same visual unit as the
 * pill, so a secondary Strong/Possible pill can't be mistaken for the student's
 * actual standing. Words carry the meaning — never a numeric score, never colour alone.
 */
export function SecondaryVerdicts({
  data,
}: {
  data: SecondaryVerdictsData | null | undefined;
}) {
  if (!data || data.items.length === 0) return null;
  const { items, pivot, primary } = data;

  return (
    <Card as="aside" radius="card" className="px-4 py-3">
      <p className="text-caption uppercase tracking-wide text-ink-faint">
        Your standing if you applied under a different field
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.field} className="flex items-center justify-between gap-3">
            <span className="text-meta text-ink-soft">
              If you applied under {item.label} instead
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-pill px-3 py-1 text-small ${VERDICT_CLS[item.verdict]}`}
            >
              {VERDICT_LABELS[item.verdict].label}
            </span>
          </li>
        ))}
      </ul>
      {pivot ? (
        <p role="note" className="mt-3 rounded-md border border-line bg-bg-tint px-3 py-2 text-small text-ink-soft">
          You&apos;d land a {BAND_WORD[pivot.verdict]} band under {pivot.label} — a stronger band than your{" "}
          {BAND_WORD[primary.verdict]} under {primary.label}. Worth exploring if a switch appeals to you.
        </p>
      ) : null}
    </Card>
  );
}
