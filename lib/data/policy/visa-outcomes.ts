import type { Sourced } from "@/lib/data/types";

/**
 * Nepal → Australia student-visa outcome data (sourced).
 *
 * DHA's published Subclass 500 grant rate for Nepal in the most recent quarter
 * (1 Apr–30 Jun 2025), from the homeaffairs.gov.au Student & Temporary Graduate
 * program report. `offshore` (finding I.032) is the rate for applications
 * lodged outside Australia — the cohort that matches a student applying from
 * Nepal, so it is the corridor-relevant figure; `onshore` (I.033) is the
 * in-Australia rate. Fields are named by cohort (not min/max) because the two
 * can invert across quarters.
 *
 * Fact-only / UI data: no scorer reads it, so it moves no verdict. It is shown
 * in the matches policy banner as a range (never a single number).
 *
 * Recency caveat: the offshore rate is on a steep multi-quarter decline
 * (93.5% → 76.5% across the prior year) — re-verify against the next quarterly
 * report and bump `lastVerified`.
 */
const DHA_STUDENT_PROGRAM_REPORT_SOURCE =
  "https://www.homeaffairs.gov.au/research-and-stats/files/student-temporary-grad-program-report-june-2025.pdf";

export const NEPAL_AU_STUDENT_VISA_GRANT_RATE: Sourced<{ offshore: number; onshore: number }> = {
  value: { offshore: 76.5, onshore: 78.7 },
  provenance: {
    findingRefs: ["I.032", "I.033"],
    source: DHA_STUDENT_PROGRAM_REPORT_SOURCE,
    effectiveDate: "2025-06-30",
    lastVerified: "2026-06-07",
    note: "DHA student-visa grant rate for Nepal, quarter 1 Apr 2025–30 Jun 2025. offshore = applications lodged outside Australia (I.032), the cohort a student applying from Nepal is in, so the corridor-relevant figure; onshore = lodged in Australia (I.033). Named by cohort, not min/max, because the two can invert across quarters. Offshore is on a steep multi-quarter decline (93.5%→76.5% over the prior year) — re-verify next quarter.",
  },
};
