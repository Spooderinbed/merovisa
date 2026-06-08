import type { AuFinancialEvidence } from "@/lib/data/types";

/**
 * DHA-accepted student financial-capacity evidence (finance category B). The four
 * acceptable evidence *paths* DHA lists for a Subclass 500 application — a money
 * deposit, a loan, a scholarship/sponsorship, or a parent/partner's income — plus
 * the rule that the declared living-cost amount is indicative of real Australian
 * costs. Prose rules consumed by the plan + checklist generators and the profile
 * finance editor for sourced "what evidence counts?" guidance. Fact-only — no
 * scorer reads it; machine-checked against findings B.007–B.011 (see
 * provenance.findingRefs).
 *
 * The four path records carry kind "evidence-path" and share the DHA student-500
 * page; the living-cost note carries kind "living-cost-note" and the SSVF page.
 * The four path summaries are written article-first so they concatenate into a
 * natural sentence in the plan generator.
 */
const DHA_STUDENT_500 = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500";
const DHA_SSVF = "https://immi.homeaffairs.gov.au/what-we-do/education-program/what-we-do/simplified-student-visa-framework";

export const AU_FINANCIAL_EVIDENCE: AuFinancialEvidence[] = [
  {
    id: "deposit",
    kind: "evidence-path",
    label: "Money deposit",
    summary: "a money deposit held with a financial institution",
    source: DHA_STUDENT_500,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.007"],
      source: DHA_STUDENT_500,
      note: "DHA lists a money deposit held with a financial institution as an acceptable evidence path (G12 enumeration).",
    },
  },
  {
    id: "loan",
    kind: "evidence-path",
    label: "Education loan",
    summary: "a loan from a government or financial institution",
    source: DHA_STUDENT_500,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.008"],
      source: DHA_STUDENT_500,
      note: "DHA lists a loan from a government or financial institution as an acceptable evidence path (G12 enumeration).",
    },
  },
  {
    id: "scholarship",
    kind: "evidence-path",
    label: "Scholarship or sponsorship",
    summary: "a scholarship or sponsorship",
    source: DHA_STUDENT_500,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.009"],
      source: DHA_STUDENT_500,
      note: "DHA lists a scholarship or sponsorship as an acceptable evidence path (G12 enumeration).",
    },
  },
  {
    id: "parent-partner-income",
    kind: "evidence-path",
    label: "Parent or partner income",
    summary: "your parents' or partner's annual income",
    source: DHA_STUDENT_500,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.010"],
      source: DHA_STUDENT_500,
      note: "DHA lists the annual income of parents or partner as an acceptable evidence path (G12 enumeration).",
    },
  },
  {
    id: "living-cost-indicative",
    kind: "living-cost-note",
    label: "Indicative living-cost amount",
    summary:
      "The living-cost amount DHA asks you to show is indicative of the real cost of living in Australia.",
    source: DHA_SSVF,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.011"],
      source: DHA_SSVF,
      note: "Under the Simplified Student Visa Framework, the declared living-cost amount should be indicative of real living costs in Australia.",
    },
  },
];
