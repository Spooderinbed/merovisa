import type { AuStudentVisaRequirement } from "@/lib/data/types";

/**
 * DHA Subclass 500 student-visa documentary requirements (visa-documents
 * category A): the four application pillars — Confirmation of Enrolment, Overseas
 * Student Health Cover, the financial-evidence coverage rules, and the Genuine
 * Student requirement. Prose rules consumed by the checklist + plan generators for
 * sourced, accurate guidance. Fact-only — no scorer reads it; machine-checked
 * against findings A.002–A.022 (see provenance.findingRefs).
 *
 * The CoE record's headline source is the DHA web-evidentiary-tool (A.002); the
 * UoW/ACU/UTS findings (A.118–A.122) corroborate a CoE's contents and issuance.
 * `financial-coverage` sources the coverage *requirement* (travel/living/tuition),
 * not the AUD 29,710 figure itself — that stays sourced via AU_DHA_LIVING_CAPACITY_AUD
 * (A.015/B.002).
 */
const DHA_EVIDENTIARY = "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool";

export const AU_STUDENT_VISA_REQUIREMENTS: AuStudentVisaRequirement[] = [
  {
    id: "coe",
    label: "Confirmation of Enrolment (CoE)",
    summary:
      "Issued after you accept your offer and pay the tuition deposit. Your CoE shows your course start/end dates and fees. You'll need it for your student visa application.",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.002", "A.118", "A.119", "A.120", "A.121", "A.122"],
      source: DHA_EVIDENTIARY,
      note: "DHA requires a CoE for all intended courses; provider findings corroborate contents and issuance conditions.",
    },
  },
  {
    id: "oshc",
    label: "Overseas Student Health Cover (OSHC)",
    summary:
      "Required for the visa. Cover must start at least a week before your course and run for your full stay; include the insurer name and policy dates in your application.",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.006", "A.007", "A.008", "A.009", "A.010", "I.026"],
      source: DHA_EVIDENTIARY,
      note: "DHA's Document Checklist Tool: OSHC must cover the applicant from at least one week before the course starts and for the duration of stay (I.026) — corroborates the A.006–A.010 OSHC rules.",
    },
  },
  {
    id: "financial-coverage",
    label: "Financial evidence coverage",
    summary:
      "Your financial evidence must cover travel, living costs, and tuition for you and any accompanying family members.",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.011", "A.012", "A.013", "C.011", "C.012", "C.013", "C.014"],
      source: DHA_EVIDENTIARY,
      note: "Coverage requirement only; the AUD 29,710 living figure is sourced via AU_DHA_LIVING_CAPACITY_AUD (A.015/B.002). C.011–C.014 corroborate the four-component formula from the DHA financial-capacity page (slice ⑥ pass).",
    },
  },
  {
    id: "genuine-student",
    label: "Genuine Student answers",
    summary:
      "Every Australian student visa (lodged since 23 March 2024) is assessed on the Genuine Student requirement, answered as four written questions.",
    questions: [
      "Your current circumstances — ties to family, community, employment, and your economic situation.",
      "Why you want to study this course in Australia with this provider, and your understanding of the course and living here.",
      "How completing the course will benefit you.",
      "Any other relevant information you want to include.",
    ],
    responseLimitWords: 150,
    appliesSince: "2024-03-23",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.016", "A.017", "A.018", "A.019", "A.020", "A.021", "A.022"],
      source: DHA_EVIDENTIARY,
      note: "Four GS questions (A.017–A.020), 150-word limit (A.021), GS since 2024-03-23 (A.016), extra question for prior-visa/onshore applicants (A.022).",
    },
  },
];
