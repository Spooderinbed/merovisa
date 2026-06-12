import Link from "next/link";
import type { AssessmentPayload } from "@/lib/results/types";
import { VerdictCard } from "@/components/results/verdict-card";
import { FactorBars } from "@/components/results/factor-bars";

export function SnapshotCard({
  primary,
  destinationLabel,
}: {
  primary: AssessmentPayload | null;
  destinationLabel: string | null;
}) {
  if (!primary) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Snapshot</span>
        <h2 className="text-[22px]">Run your first assessment</h2>
        <p className="text-[15px] text-ink-soft">Two minutes, no questions skipped. We&apos;ll show where you stand.</p>
        <Link
          href="/assess"
          className="mt-2 inline-flex w-fit items-center rounded-pill bg-primary px-5 py-2 text-[15px] font-medium text-on-primary hover:bg-primary-ink"
        >
          Check eligibility →
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Your standing for {destinationLabel ?? "your destination"}
      </span>
      <VerdictCard verdict={primary.result.verdict} rulesVerified={primary.rulesVerified} />
      <FactorBars dimensions={primary.result.dimensions} />
    </div>
  );
}
