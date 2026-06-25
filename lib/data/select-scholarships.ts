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

/** Build the readable application-window line from the held open/close dates. */
function formatWindow(opens: string, closes: string): string {
  return `Applications open ${formatIsoDate(opens)}, close ${formatIsoDate(closes)}`;
}

export function selectScholarships(): ScholarshipRow[] {
  // Australia Awards first — the Nepal-scoped, fully-funded award leads the list.
  const awardsRows: ScholarshipRow[] = AUSTRALIA_AWARDS_SCHOLARSHIPS.map((s) => ({
    id: s.id,
    name: s.name,
    who: `DFAT — for ${s.country}, master's study`,
    whatItCovers: `Fully funded: covers ${joinBenefits(s.benefits.map((b) => BENEFIT_LABEL[b]))}.`,
    amount: "Fully funded",
    source: s.source,
    lastVerified: s.lastVerified,
    // The Australia Awards record holds a fixed application window; surface it.
    applicationWindow: formatWindow(s.applicationOpens, s.applicationCloses),
  }));

  const otherRows: ScholarshipRow[] = AU_SCHOLARSHIPS.map((s) => ({
    id: s.id,
    name: s.name,
    who: s.regionalCampusOnly ? `${s.provider} — regional campuses` : s.provider,
    whatItCovers: s.benefits?.length ? s.benefits.join(", ") : s.provider,
    amount: formatAmount(s),
    source: s.source,
    lastVerified: s.lastVerified,
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
    // Published as a floor ("over AUD N"); show in millions to stay readable.
    const millions = s.totalAnnualValueAud / 1_000_000;
    return `Over AUD ${millions.toLocaleString()} million awarded per year`;
  }
  return "See provider";
}
