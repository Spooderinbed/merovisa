import type { AuEnrolmentLodgementSource } from "@/lib/data/types";

/**
 * Enrolment → lodgement connective-step sources (MV-57 journey-spine). The two
 * genuinely-new government pages this slice cites get a sourced home here so every
 * URL the plan renders stays traceable ("source + lastVerified on every data point"):
 *
 * - Study Australia, "How to apply to study" — apply via the provider's own website
 *   or by emailing it; a Letter of Offer is issued; the CoE is sent after you accept
 *   the offer and pay the deposit; a CoE is mandatory to lodge since 1 Jan 2025.
 *   Backs the `submit-university-applications` and `accept-offer` plan steps.
 * - DHA, "After you apply" — use ImmiAccount to check messages and application status
 *   and respond to requests. Backs the `track-visa-decision` plan step.
 *
 * The CoE/OSHC facts (au-student-visa-requirements) and the Subclass 500 charge
 * (au-visa-fees) already have canonical modules; this module is only for the two URLs
 * that did not. DISPLAY-pattern data: no scorer reads it; pinned by the plan-source
 * drift guard (tests/plan/sources.test.ts).
 */
const STUDY_AUSTRALIA_HOW_TO_APPLY =
  "https://www.studyaustralia.gov.au/en/plan-your-studies/how-to-apply-to-study";
const DHA_AFTER_YOU_APPLY =
  "https://immi.homeaffairs.gov.au/help-support/applying-online-or-on-paper/online/after-you-apply";

export const AU_ENROLMENT_LODGEMENT_SOURCES: AuEnrolmentLodgementSource[] = [
  {
    id: "study-australia-how-to-apply",
    label: "Study Australia — how to apply",
    source: STUDY_AUSTRALIA_HOW_TO_APPLY,
    lastVerified: "2026-06-28",
  },
  {
    id: "dha-after-you-apply",
    label: "DHA — after you apply",
    source: DHA_AFTER_YOU_APPLY,
    lastVerified: "2026-06-28",
  },
];
