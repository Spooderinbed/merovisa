import type { Verdict } from "@/lib/scoring/types";
import { VerdictDisclaimer } from "@/components/ui/verdict-disclaimer";

const VERDICT_META: Record<Verdict, { label: string; line: string; cls: string }> = {
  strong: {
    label: "Strong match",
    line: "You have a realistic shot, with strong fundamentals.",
    cls: "bg-strong-tint text-strong",
  },
  possible: {
    label: "Possible",
    line: "You have a realistic shot, with a few areas to strengthen.",
    cls: "bg-possible-tint text-possible",
  },
  reach: {
    label: "Reach",
    line: "This is ambitious — focus on strengthening a few key areas.",
    cls: "bg-reach-tint text-reach",
  },
};

export function VerdictCard({
  verdict,
  rulesVerified,
  rulesStale = false,
}: {
  verdict: Verdict;
  rulesVerified?: string;
  /** A scoring-critical input is past its reverifyBy — degrade the verdict (MV-04). */
  rulesStale?: boolean;
}) {
  const meta = VERDICT_META[verdict];
  return (
    <section className="animate-rise rounded-lg border border-line bg-surface p-6">
      <span className={`inline-flex items-center rounded-pill px-3 py-1 font-mono text-[12.5px] ${meta.cls}`}>
        {meta.label}
      </span>
      <h2 className="mt-4 text-[clamp(24px,3vw,32px)]">{meta.line}</h2>
      {/* When a scoring rule is overdue for re-verification, warn + lower confidence
          rather than show the calm "verified {date}" line — a stale verdict must
          never read as current. */}
      {rulesStale ? (
        <p className="mt-3 rounded-lg bg-possible-tint px-3 py-2 font-mono text-[12.5px] text-possible">
          Some scoring rules are overdue for re-verification
          {rulesVerified ? ` (last verified ${rulesVerified})` : ""} — treat this verdict as
          indicative, not current.
        </p>
      ) : rulesVerified ? (
        <p className="mt-3 font-mono text-[12.5px] text-ink-faint">
          Assessment rules verified {rulesVerified}
        </p>
      ) : null}
      <VerdictDisclaimer className="mt-4" />
    </section>
  );
}
