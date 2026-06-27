import type { Verdict } from "@/lib/scoring/types";
import { VERDICT_LABELS } from "@/lib/scoring/verdict-labels";
import { VerdictDisclaimer } from "@/components/ui/verdict-disclaimer";

// The pill label is sourced from VERDICT_LABELS (shared with the matches list);
// only the results-card-specific copy (the headline line) and the pill's colour
// classes live here.
const VERDICT_META: Record<Verdict, { line: string; cls: string }> = {
  strong: {
    line: "You have a realistic shot, with strong fundamentals.",
    cls: "bg-strong-tint text-strong",
  },
  possible: {
    line: "You have a realistic shot, with a few areas to strengthen.",
    cls: "bg-possible-tint text-possible-ink",
  },
  reach: {
    line: "This is ambitious — focus on strengthening a few key areas.",
    cls: "bg-reach-tint text-reach",
  },
};

/**
 * The reach band spans everything from a borderline profile to a near-zero one,
 * so one line can't be honest for all of it. When a severity signal is present
 * (the weighted 0–100 score, used here only to pick copy — never shown), a deeply
 * short profile gets a blunt line instead of the gentle "a few key areas". The
 * number itself is never rendered, keeping the no-raw-scores rule intact.
 */
const REACH_SEVERE_BELOW = 30;
const REACH_SEVERE_LINE =
  "This is well out of reach right now — the gaps are substantial, not a few tweaks.";

export function VerdictCard({
  verdict,
  weighted,
  rulesVerified,
  rulesStale = false,
}: {
  verdict: Verdict;
  /**
   * The weighted 0–100 score behind the verdict. Used only to scale the lowest
   * band's copy by severity — never displayed. Absent on legacy payloads, in which
   * case the standard reach line is shown.
   */
  weighted?: number;
  rulesVerified?: string;
  /** A scoring-critical input is past its reverifyBy — degrade the verdict (MV-04). */
  rulesStale?: boolean;
}) {
  const meta = VERDICT_META[verdict];
  const line =
    verdict === "reach" && weighted !== undefined && weighted < REACH_SEVERE_BELOW
      ? REACH_SEVERE_LINE
      : meta.line;
  return (
    <section className="animate-rise rounded-lg border border-line bg-surface p-6">
      <span className={`inline-flex items-center rounded-pill px-3 py-1 font-mono text-[12.5px] ${meta.cls}`}>
        {VERDICT_LABELS[verdict].label}
      </span>
      <h2 className="mt-4 text-[clamp(24px,3vw,32px)]">{line}</h2>
      {/* When a scoring rule is overdue for re-verification, warn + lower confidence
          rather than show the calm "verified {date}" line — a stale verdict must
          never read as current. */}
      {rulesStale ? (
        <p className="mt-3 rounded-lg bg-possible-tint px-3 py-2 font-mono text-[12.5px] text-possible-ink">
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
