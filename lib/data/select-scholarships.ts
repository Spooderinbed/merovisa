import type { AustraliaAwardsBenefit } from "@/lib/data/types";
import { AUSTRALIA_AWARDS_SCHOLARSHIPS } from "@/lib/data/source/australia-awards-scholarship";
import { AU_SCHOLARSHIPS } from "@/lib/data/source/au-scholarships";

/**
 * A curated reference list of scholarships a Nepal → Australia student may be
 * able to apply for, assembled from the sourced fact modules for display.
 *
 * Two honesty constraints shape the shape:
 *  - The Australia Awards Scholarship (DFAT, Nepal-scoped, fully funded) leads,
 *    because it is the only award scoped to Nepal and the most consequential.
 *  - Amounts are currency-honest and carry the funder's own qualifiers: where a
 *    figure is published only as a floor ("more than 300", "over AUD 135
 *    million"), the qualifier survives into the displayed string rather than
 *    being silently dropped to a bare number. The Australia Awards stipend is
 *    intentionally unmodeled (DFAT revises it annually), so its value is the
 *    documented fact "fully funded" rather than an invented figure.
 * Every row keeps its own source + verified date, so each claim is one click
 * from its origin. No row implies the student qualifies — eligibility lives
 * with the provider.
 */
export interface ScholarshipRow {
  id: string;
  name: string;
  /** The funder / scope, e.g. "DFAT — for Nepal" or "University of Melbourne". */
  who: string;
  /** What the award covers, in plain words (DFAT inclusions or funder benefits). */
  whatItCovers: string;
  /** Currency-honest amount string, with 'more than'/'over' floors preserved. */
  amount: string;
  source: string;
  lastVerified?: string;
  /**
   * Readable application window ("Applications open …, close …"), present only
   * when the funder publishes fixed open/close dates. Absent when no dates are
   * held — never invented (trust-first honest absence).
   */
  applicationWindow?: string;
  /**
   * Who the award is actually for, when it materially narrows the applicant pool
   * (e.g. research-degree-only). Present only where a real restriction is held —
   * absent where the level is unrestricted (honest absence), so coursework
   * applicants aren't misled into chasing research-only awards.
   */
  studyEligibility?: string;
}

const BENEFIT_LABEL: Record<AustraliaAwardsBenefit, string> = {
  "full-tuition": "full tuition",
  "return-airfare": "return airfare",
  oshc: "health cover (OSHC)",
  "living-stipend": "a living stipend",
};

/** Join benefit labels into a readable "a, b, c, and d" clause. */
function joinBenefits(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Render a fixed ISO date ("YYYY-MM-DD") as "D Mon YYYY" deterministically — by
 * splitting the parts, not via Date(), so there is no timezone drift.
 */
function formatIsoDate(iso: string): string {
  const year = iso.slice(0, 4);
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Build the readable application-window line for a window that is still open. */
function formatWindow(opens: string, closes: string): string {
  return `Applications open ${formatIsoDate(opens)}, close ${formatIsoDate(closes)}`;
}

/**
 * Build the window line for a window whose close date has passed. It states the
 * close date (a permanent, verifiable fact) and points the student to the funder for
 * the next round — rather than asserting the next round is "not yet published", a
 * publication-status claim the record cannot support and that would silently go false
 * the day DFAT publishes it. The next intake's dates are deliberately NOT invented.
 */
function formatClosedWindow(closes: string): string {
  return `Applications closed ${formatIsoDate(closes)} — check DFAT for the next round's dates.`;
}

/**
 * @param today ISO date ("YYYY-MM-DD"), injected by the caller. Read here, never via
 *   `new Date()` — a clock read inside the selector makes the suite self-expiring, the
 *   exact trap that let a closed window render in the present tense (audit F-19).
 */
export function selectScholarships(today: string): ScholarshipRow[] {
  // Australia Awards first — the Nepal-scoped, fully-funded award leads the list.
  const awardsRows: ScholarshipRow[] = AUSTRALIA_AWARDS_SCHOLARSHIPS.map((s) => ({
    id: s.id,
    name: s.name,
    who: `DFAT — for ${s.country}, master's study`,
    whatItCovers: `Fully funded: covers ${joinBenefits(s.benefits.map((b) => BENEFIT_LABEL[b]))}.`,
    amount: "Fully funded",
    source: s.source,
    lastVerified: s.lastVerified,
    // The Australia Awards record holds a fixed application window; surface it, but
    // once the close date has arrived, say the window is closed rather than showing
    // "Applications open …" in the present tense. The record holds only a calendar
    // date (no intra-day cutoff), so we treat the close date itself as closed —
    // erring toward "closed" so we never tell a student a shut window is still open,
    // which is the exact F-19 failure. ISO dates compare lexicographically.
    applicationWindow:
      today >= s.applicationCloses
        ? formatClosedWindow(s.applicationCloses)
        : formatWindow(s.applicationOpens, s.applicationCloses),
  }));

  const otherRows: ScholarshipRow[] = AU_SCHOLARSHIPS.map((s) => ({
    id: s.id,
    name: s.name,
    who: s.regionalCampusOnly ? `${s.provider} — regional campuses` : s.provider,
    whatItCovers: s.benefits?.length ? s.benefits.join(", ") : s.provider,
    amount: formatAmount(s),
    source: s.source,
    lastVerified: s.lastVerified,
    // Surface a research-degree restriction where held; absent otherwise.
    studyEligibility: s.researchDegreeOnly
      ? "Research degrees only — PhD or research master's"
      : undefined,
  }));

  return [...awardsRows, ...otherRows];
}

/**
 * Build the currency-honest amount string for an au-scholarships row. Each
 * record sets exactly one of the numeric fields; the "more than"/"over"
 * qualifiers come straight from the funder's published wording.
 */
function formatAmount(s: (typeof AU_SCHOLARSHIPS)[number]): string {
  if (s.annualAmountAud !== undefined) {
    return `AUD ${s.annualAmountAud.toLocaleString()} per year`;
  }
  if (s.annualScholarshipCount !== undefined) {
    // Published as a floor ("more than N awarded annually").
    return `More than ${s.annualScholarshipCount.toLocaleString()} awarded per year`;
  }
  if (s.totalAnnualValueAud !== undefined) {
    // A funder-wide pool ("over AUD N across ALL its scholarships"), not a single
    // applyable award — label it so a student never reads it as one they'd receive.
    const millions = s.totalAnnualValueAud / 1_000_000;
    return `Over AUD ${millions.toLocaleString()} million awarded across all its scholarships per year`;
  }
  return "See provider";
}
