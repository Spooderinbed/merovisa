import type { AuHealthExam } from "@/lib/data/types";

/**
 * DHA health-examination readiness facts (logistics category A) for an Australian
 * student-visa applicant. Three process rules (A.036 panel physician/clinic overseas,
 * A.038 cost paid directly, A.033 My Health Declarations before lodging) and the
 * 6-month health-undertaking validity (A.035), consumed by the checklist + plan
 * generators. The 12-month base validity is reused from C.092 (au-health-biometric-
 * facts), not duplicated here. Fact-only — no scorer reads it; machine-checked against
 * findings A.033, A.035, A.036, A.038 (see provenance.findingRefs).
 *
 * `process` summaries are standalone sentences (joined by a space); the `validity`
 * summary is a fragment designed to append after the 12-month base.
 */
const DHA_HEALTH_ARRANGE =
  "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/arrange-your-health-examinations";
const DHA_FORM_26 = "https://immi.homeaffairs.gov.au/form-listing/forms/26.pdf";
const DHA_HEALTH_WHEN =
  "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/when-to-have-health-examinations";
const DHA_HEALTH_AFTER =
  "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/after-your-health-examinations";

export const AU_HEALTH_EXAM: AuHealthExam[] = [
  {
    id: "panel-physician-overseas",
    kind: "process",
    label: "Panel physician (overseas)",
    summary: "Outside Australia, the examination must be done by a DHA-approved panel physician or clinic.",
    source: DHA_HEALTH_ARRANGE,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.036"],
      source: DHA_HEALTH_ARRANGE,
      note: "DHA: outside Australia, health examinations must be done by an approved panel physician or clinic.",
    },
  },
  {
    id: "cost-paid-to-clinic",
    kind: "process",
    label: "Cost paid to clinic",
    summary: "You pay the panel physician or clinic directly.",
    source: DHA_FORM_26,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.038"],
      source: DHA_FORM_26,
      note: "Form 26: the costs of health examinations are paid directly to the panel physician or clinic by the applicant.",
    },
  },
  {
    id: "mhd-before-lodging",
    kind: "process",
    label: "My Health Declarations",
    summary: "If your visa is eligible, the My Health Declarations service lets you complete it before you lodge.",
    source: DHA_HEALTH_WHEN,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.033"],
      source: DHA_HEALTH_WHEN,
      note: "DHA: My Health Declarations lets eligible applicants complete health examinations before submitting the visa application.",
    },
  },
  {
    id: "undertaking-validity",
    kind: "validity",
    label: "Health-undertaking validity",
    summary: "6 months if DHA asks you to sign a health undertaking.",
    source: DHA_HEALTH_AFTER,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.035"],
      source: DHA_HEALTH_AFTER,
      note: "DHA: if a health undertaking is signed, the health-assessment validity is 6 months.",
    },
  },
];
