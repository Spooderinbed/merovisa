import Link from "next/link";
import type { AssessmentPayload } from "@/lib/results/types";
import { Card } from "@/components/ui/card";
import { VerdictCard } from "@/components/results/verdict-card";
import { FactorBars } from "@/components/results/factor-bars";
import { scoringRulesStale } from "@/lib/data/scoring-freshness";

export function SnapshotCard({
  primary,
  destinationLabel,
}: {
  primary: AssessmentPayload | null;
  destinationLabel: string | null;
}) {
  if (!primary) {
    return (
      <Card padding="lg" className="animate-rise flex flex-col gap-3">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Snapshot</span>
        <h2 className="text-display">Run your first assessment</h2>
        <p className="text-body text-ink-soft">9 quick questions, no questions skipped. We&apos;ll show where you stand.</p>
        <Link
          href="/assess"
          className="mt-2 inline-flex w-fit items-center rounded-pill bg-primary px-5 py-2 text-body font-medium text-on-primary hover:bg-primary-ink"
        >
          Check eligibility →
        </Link>
      </Card>
    );
  }
  return (
    <Card padding="lg" className="animate-rise flex flex-col gap-4">
      <span className="text-caption uppercase tracking-wide text-ink-faint">
        Your standing for {destinationLabel ?? "your destination"}
      </span>
      {/* Recompute staleness live (server component): a stored verdict can age past
          a rule's reverifyBy between visits, so the dashboard reflects "as of now",
          not the flag captured when the assessment was scored. */}
      <VerdictCard
        verdict={primary.result.verdict}
        rulesVerified={primary.rulesVerified}
        rulesStale={scoringRulesStale()}
      />
      <FactorBars dimensions={primary.result.dimensions} />
    </Card>
  );
}
