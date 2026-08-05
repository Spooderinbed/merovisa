import type { Verdict } from "@/lib/scoring/types";
import { Card } from "@/components/ui/card";
import { VerdictDisclaimer } from "@/components/ui/verdict-disclaimer";
import { VerdictPill } from "@/components/ui/verdict-pill";

// The pill (label + colour classes) is the shared VerdictPill primitive; only
// the results-card-specific copy (the headline line) lives here.
const VERDICT_META: Record<Verdict, { line: string }> = {
  strong: {
    line: "You have a realistic shot, with strong fundamentals.",
  },
  possible: {
    line: "You have a realistic shot, with a few areas to strengthen.",
  },
  reach: {
    line: "This is ambitious — focus on strengthening a few key areas.",
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
    // Two-beat reveal (audit #25): the card rises (beat 1), then the band pill
    // settles ~120ms later (beat 2) so the verdict carries more weight than a
    // sibling card. Only the word-label pill is staggered — the never-shown score
    // is never animated, so the motion can't imply a computed number.
    <Card as="section" padding="lg" className="animate-rise">
      <VerdictPill verdict={verdict} size="lg" className="animate-settle" />
      <h2 className="mt-4 text-[clamp(24px,3vw,32px)]">{line}</h2>
      {/* When a scoring rule is overdue for re-verification, warn + lower confidence
          rather than show the calm "verified {date}" line — a stale verdict must
          never read as current. */}
      {rulesStale ? (
        <p className="mt-3 rounded-lg bg-possible-tint px-3 py-2 text-small text-possible-ink">
          Some scoring rules are overdue for re-verification
          {rulesVerified ? ` (last verified ${rulesVerified})` : ""} — treat this verdict as
          indicative, not current.
        </p>
      ) : rulesVerified ? (
        <p className="mt-3 text-small text-ink-faint">
          Assessment rules verified {rulesVerified}
        </p>
      ) : null}
      <VerdictDisclaimer className="mt-4" />
    </Card>
  );
}
